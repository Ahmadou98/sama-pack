-- SAMA-PACK: central SMS delivery for every in-app notification.
-- SMS messages are queued in a private outbox and dispatched asynchronously.
-- The Orange credentials remain Edge Function secrets, never database/client data.

create table if not exists private.notification_sms_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','processing','sent','failed','skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  provider_message_id text,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (notification_id)
);

create index if not exists notification_sms_outbox_due_idx
  on private.notification_sms_outbox (next_attempt_at, created_at)
  where status in ('pending','failed');

alter table private.notification_sms_outbox enable row level security;
revoke all on table private.notification_sms_outbox from public, anon, authenticated, service_role;

create or replace function private.enqueue_notification_sms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.notification_sms_outbox (notification_id)
  values (new.id)
  on conflict (notification_id) do nothing;
  return new;
end;
$$;

revoke all on function private.enqueue_notification_sms() from public, anon, authenticated, service_role;

drop trigger if exists notifications_enqueue_sms on public.notifications;
create trigger notifications_enqueue_sms
after insert on public.notifications
for each row execute function private.enqueue_notification_sms();

-- Worker authentication: the cron token is stored only in Supabase Vault.
create or replace function public.sama_validate_notification_sms_worker_token(p_token text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    p_token is not null
    and p_token <> ''
    and p_token = (
      select s.decrypted_secret
      from vault.decrypted_secrets s
      where s.name = 'sama_notification_sms_worker_token'
      limit 1
    ),
    false
  );
$$;

revoke all on function public.sama_validate_notification_sms_worker_token(text) from public, anon, authenticated;
grant execute on function public.sama_validate_notification_sms_worker_token(text) to service_role;

-- Atomically claim jobs so overlapping cron invocations cannot send the same row.
create or replace function public.sama_claim_notification_sms_batch(p_limit integer default 40)
returns table (
  outbox_id uuid,
  notification_id uuid,
  phone text,
  title text,
  message text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'service_role required';
  end if;

  return query
  with picked as (
    select q.id
    from private.notification_sms_outbox q
    where (
      (q.status in ('pending','failed') and q.next_attempt_at <= now())
      or (q.status = 'processing' and q.locked_at < now() - interval '10 minutes')
    )
    and q.attempts < 6
    order by q.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 40), 100))
  ),
  claimed as (
    update private.notification_sms_outbox q
    set status = 'processing',
        attempts = q.attempts + 1,
        locked_at = now(),
        updated_at = now()
    from picked
    where q.id = picked.id
    returning q.id, q.notification_id, q.attempts
  )
  select
    c.id,
    n.id,
    nullif(trim(p.phone), ''),
    n.title,
    n.message,
    c.attempts
  from claimed c
  join public.notifications n on n.id = c.notification_id
  left join public.profiles p on p.id = n.recipient_user_id
  order by c.id;
end;
$$;

revoke all on function public.sama_claim_notification_sms_batch(integer) from public, anon, authenticated;
grant execute on function public.sama_claim_notification_sms_batch(integer) to service_role;

create or replace function public.sama_finish_notification_sms_job(
  p_outbox_id uuid,
  p_status text,
  p_provider_message_id text default null,
  p_error text default ''
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'service_role required';
  end if;
  if p_status not in ('sent','failed','skipped') then
    raise exception 'invalid SMS job status';
  end if;

  update private.notification_sms_outbox q
  set status = p_status,
      provider_message_id = case when p_status = 'sent' then nullif(p_provider_message_id, '') else q.provider_message_id end,
      last_error = case when p_status = 'failed' then left(coalesce(p_error,''),1000) else '' end,
      sent_at = case when p_status = 'sent' then now() else q.sent_at end,
      next_attempt_at = case
        when p_status = 'failed' and q.attempts < 6
          then now() + make_interval(secs => least(3600, 60 * power(2, least(q.attempts, 5))::integer))
        else q.next_attempt_at
      end,
      locked_at = null,
      updated_at = now()
  where q.id = p_outbox_id
    and q.status = 'processing';
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.sama_finish_notification_sms_job(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.sama_finish_notification_sms_job(uuid,text,text,text) to service_role;

-- Create a private random token used only by the database cron -> Edge Function call.
select vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'sama_notification_sms_worker_token');

-- Process pending notifications once per minute. The worker itself validates the Vault token.
do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'sama-send-notification-sms';
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end;
$$;

select cron.schedule(
  'sama-send-notification-sms',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://tbxxrnhcfuaeaatlrdtr.supabase.co/functions/v1/sama-send-sms',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-sms-cron-token', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'sama_notification_sms_worker_token'
          limit 1
        )
      ),
      body := jsonb_build_object('source','scheduled'),
      timeout_milliseconds := 15000
    );
  $job$
);
