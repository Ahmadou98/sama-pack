-- SAMA-PACK — gestion des réseaux sociaux
-- À appliquer après revue/validation de cette branche.
-- Les identifiants OAuth ne sont jamais exposés dans les tables publiques.

create schema if not exists private;

create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('tiktok','instagram','facebook','linkedin','youtube')),
  provider_account_id text not null,
  account_name text not null default '',
  username text not null default '',
  profile_url text not null default '',
  avatar_url text not null default '',
  status text not null default 'disconnected'
    check (status in ('connected','disconnected','token_expired','error')),
  scopes text[] not null default '{}'::text[],
  token_expires_at timestamptz,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_account_id)
);

create table if not exists public.social_media_assets (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  original_name text not null default '',
  mime_type text not null check (mime_type in (
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/quicktime'
  )),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  status text not null default 'draft'
    check (status in (
      'draft','pending_approval','scheduled','publishing',
      'published','partially_published','failed','cancelled'
    )),
  scheduled_at timestamptz,
  media_asset_id uuid references public.social_media_assets(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_post_targets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  provider text not null check (provider in ('tiktok','instagram','facebook','linkedin','youtube')),
  social_account_id uuid references public.social_accounts(id) on delete set null,
  caption text not null default '',
  publication_mode text not null default 'approval'
    check (publication_mode in ('automatic','approval','manual')),
  status text not null default 'awaiting_connection'
    check (status in (
      'awaiting_connection','draft','scheduled','manual_required','publishing',
      'published','failed','cancelled'
    )),
  scheduled_at timestamptz,
  platform_post_id text,
  permalink text,
  error_code text,
  error_message text not null default '',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  provider_options jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (post_id, provider)
);

create index if not exists social_posts_status_schedule_idx
  on public.social_posts(status, scheduled_at);
create index if not exists social_posts_created_at_idx
  on public.social_posts(created_at desc);
create index if not exists social_post_targets_post_idx
  on public.social_post_targets(post_id);
create index if not exists social_accounts_provider_status_idx
  on public.social_accounts(provider, status);

alter table public.social_accounts enable row level security;
alter table public.social_media_assets enable row level security;
alter table public.social_posts enable row level security;
alter table public.social_post_targets enable row level security;

grant select, insert, update, delete on public.social_accounts to authenticated;
grant select, insert, update, delete on public.social_media_assets to authenticated;
grant select, insert, update, delete on public.social_posts to authenticated;
grant select, insert, update, delete on public.social_post_targets to authenticated;

drop policy if exists social_accounts_read on public.social_accounts;
create policy social_accounts_read on public.social_accounts
  for select to authenticated
  using (private.sama_has_admin_permission('social.view'));

drop policy if exists social_accounts_insert on public.social_accounts;
create policy social_accounts_insert on public.social_accounts
  for insert to authenticated
  with check (private.sama_has_admin_permission('social.accounts.manage'));

drop policy if exists social_accounts_update on public.social_accounts;
create policy social_accounts_update on public.social_accounts
  for update to authenticated
  using (private.sama_has_admin_permission('social.accounts.manage'))
  with check (private.sama_has_admin_permission('social.accounts.manage'));

drop policy if exists social_accounts_delete on public.social_accounts;
create policy social_accounts_delete on public.social_accounts
  for delete to authenticated
  using (private.sama_has_admin_permission('social.accounts.manage'));

drop policy if exists social_media_assets_read on public.social_media_assets;
create policy social_media_assets_read on public.social_media_assets
  for select to authenticated
  using (private.sama_has_admin_permission('social.view'));

drop policy if exists social_media_assets_insert on public.social_media_assets;
create policy social_media_assets_insert on public.social_media_assets
  for insert to authenticated
  with check (
    private.sama_has_admin_permission('social.manage')
    and uploaded_by = (select auth.uid())
  );

drop policy if exists social_media_assets_delete on public.social_media_assets;
create policy social_media_assets_delete on public.social_media_assets
  for delete to authenticated
  using (private.sama_has_admin_permission('social.manage'));

drop policy if exists social_posts_read on public.social_posts;
create policy social_posts_read on public.social_posts
  for select to authenticated
  using (private.sama_has_admin_permission('social.view'));

drop policy if exists social_posts_insert on public.social_posts;
create policy social_posts_insert on public.social_posts
  for insert to authenticated
  with check (
    private.sama_has_admin_permission('social.manage')
    and created_by = (select auth.uid())
  );

drop policy if exists social_posts_update on public.social_posts;
create policy social_posts_update on public.social_posts
  for update to authenticated
  using (private.sama_has_admin_permission('social.manage'))
  with check (private.sama_has_admin_permission('social.manage'));

drop policy if exists social_posts_delete on public.social_posts;
create policy social_posts_delete on public.social_posts
  for delete to authenticated
  using (private.sama_has_admin_permission('social.manage'));

drop policy if exists social_post_targets_read on public.social_post_targets;
create policy social_post_targets_read on public.social_post_targets
  for select to authenticated
  using (private.sama_has_admin_permission('social.view'));

drop policy if exists social_post_targets_insert on public.social_post_targets;
create policy social_post_targets_insert on public.social_post_targets
  for insert to authenticated
  with check (
    private.sama_has_admin_permission('social.manage')
    and exists (
      select 1 from public.social_posts p
      where p.id = post_id
    )
  );

drop policy if exists social_post_targets_update on public.social_post_targets;
create policy social_post_targets_update on public.social_post_targets
  for update to authenticated
  using (private.sama_has_admin_permission('social.manage'))
  with check (
    private.sama_has_admin_permission('social.manage')
    and exists (
      select 1 from public.social_posts p
      where p.id = post_id
    )
  );

drop policy if exists social_post_targets_delete on public.social_post_targets;
create policy social_post_targets_delete on public.social_post_targets
  for delete to authenticated
  using (private.sama_has_admin_permission('social.manage'));

-- Stockage privé : seules les personnes autorisées au module peuvent lire/ajouter/supprimer.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sama-social-media',
  'sama-social-media',
  false,
  104857600,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists sama_social_media_read on storage.objects;
create policy sama_social_media_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'sama-social-media'
    and private.sama_has_admin_permission('social.view')
  );

drop policy if exists sama_social_media_insert on storage.objects;
create policy sama_social_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'sama-social-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and private.sama_has_admin_permission('social.manage')
  );

drop policy if exists sama_social_media_delete on storage.objects;
create policy sama_social_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'sama-social-media'
    and private.sama_has_admin_permission('social.manage')
  );

-- Les secrets OAuth sont chiffrés côté serveur puis stockés dans des tables
-- publiques uniquement pour permettre l'accès PostgREST au service_role.
-- Aucun rôle navigateur ne reçoit de privilège ni de politique RLS.
create table if not exists public.social_credentials (
  social_account_id uuid primary key references public.social_accounts(id) on delete cascade,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  encryption_key_version text not null,
  token_expires_at timestamptz,
  scopes text[] not null default '{}'::text[],
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.social_oauth_states (
  state_hash text primary key,
  provider text not null check (provider in ('tiktok','instagram','facebook','linkedin','youtube')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  redirect_path text not null default '/?spAction=manage&view=social',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.social_credentials enable row level security;
alter table public.social_oauth_states enable row level security;
revoke all on table public.social_credentials from public, anon, authenticated;
revoke all on table public.social_oauth_states from public, anon, authenticated;
grant select, insert, update, delete on table public.social_credentials to service_role;
grant select, insert, update, delete on table public.social_oauth_states to service_role;

drop policy if exists social_credentials_service_role on public.social_credentials;
create policy social_credentials_service_role on public.social_credentials
  for all to service_role using (true) with check (true);

drop policy if exists social_oauth_states_service_role on public.social_oauth_states;
create policy social_oauth_states_service_role on public.social_oauth_states
  for all to service_role using (true) with check (true);

-- La file est réservée au service_role. Les accès déclenchés depuis l'interface
-- sont préalablement autorisés par l'Edge Function, qui contrôle les permissions.
create or replace function public.sama_claim_social_targets(p_limit integer default 10)
returns setof public.social_post_targets
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Accès réservé au moteur de publication.';
  end if;

  return query
  with candidates as (
    select t.id
    from public.social_post_targets t
    join public.social_posts p on p.id = t.post_id
    join public.social_accounts a on a.id = t.social_account_id
    where (
        (
          t.status = 'scheduled'
          and t.publication_mode in ('automatic','approval')
          and t.scheduled_at is not null
          and t.scheduled_at <= now()
        )
        or (
          t.status = 'publishing'
          and t.provider = 'tiktok'
          and t.platform_post_id is not null
          and t.attempt_count < 50
          and (t.last_attempt_at is null or t.last_attempt_at <= now() - interval '4 minutes')
        )
      )
      and a.status = 'connected'
      and p.status in ('scheduled','partially_published')
    order by t.scheduled_at asc, t.created_at asc
    limit greatest(1, least(coalesce(p_limit,10), 25))
    for update of t skip locked
  )
  update public.social_post_targets t
  set status = 'publishing',
      attempt_count = t.attempt_count + 1,
      last_attempt_at = now(),
      updated_at = now()
  from candidates c
  where t.id = c.id
  returning t.*;
end;
$function$;

revoke all on function public.sama_claim_social_targets(integer) from public, anon, authenticated;
grant execute on function public.sama_claim_social_targets(integer) to service_role;

-- Clés aléatoires générées une seule fois et conservées dans Supabase Vault.
-- La clé AES chiffre les jetons OAuth avant insertion dans social_credentials.
do $social_vault$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'sama_social_token_encryption_key'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'sama_social_token_encryption_key',
      'Clé AES-GCM utilisée exclusivement par l’Edge Function Social Desk.'
    );
  end if;

  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'sama_social_worker_token'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(48), 'base64'),
      'sama_social_worker_token',
      'Jeton serveur-à-serveur pour le déclencheur périodique des publications SAMA-PACK.'
    );
  end if;
end;
$social_vault$;

create or replace function public.sama_get_social_token_encryption_key()
returns text
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Accès réservé au moteur social.';
  end if;
  return (
    select decrypted_secret
    from vault.decrypted_secrets
    where name = 'sama_social_token_encryption_key'
    limit 1
  );
end;
$function$;

create or replace function public.sama_get_social_worker_token()
returns text
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Accès réservé au moteur social.';
  end if;
  return (
    select decrypted_secret
    from vault.decrypted_secrets
    where name = 'sama_social_worker_token'
    limit 1
  );
end;
$function$;

revoke all on function public.sama_get_social_token_encryption_key() from public, anon, authenticated;
revoke all on function public.sama_get_social_worker_token() from public, anon, authenticated;
grant execute on function public.sama_get_social_token_encryption_key() to service_role;
grant execute on function public.sama_get_social_worker_token() to service_role;

-- Un déclencheur périodique vérifie les publications arrivées à échéance et
-- les traitements TikTok encore en cours. Le jeton serveur reste dans Vault.
do $social_cron$
begin
  if not exists (
    select 1 from cron.job where jobname = 'sama-pack-social-publisher'
  ) then
    perform cron.schedule(
      'sama-pack-social-publisher',
      '*/5 * * * *',
      $job$
        select net.http_post(
          url := 'https://tbxxrnhcfuaeaatlrdtr.supabase.co/functions/v1/sama-social-platforms',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-social-worker-token', (
              select decrypted_secret
              from vault.decrypted_secrets
              where name = 'sama_social_worker_token'
              limit 1
            )
          ),
          body := jsonb_build_object('action', 'worker'),
          timeout_milliseconds := 120000
        );
      $job$
    );
  end if;
end;
$social_cron$;

-- Validation des publications préparées par un collaborateur.
-- Cette fonction ne lance PAS une publication externe ; elle enregistre l'approbation.
create or replace function public.sama_approve_social_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_status text;
  v_scheduled_at timestamptz;
begin
  if v_actor is null or not private.sama_has_admin_permission('social.publish') then
    raise exception 'La permission de validation des publications est requise.';
  end if;

  select p.status, p.scheduled_at
    into v_status, v_scheduled_at
  from public.social_posts p
  where p.id = p_post_id
  for update;

  if not found then
    raise exception 'Publication introuvable.';
  end if;
  if v_status <> 'pending_approval' then
    raise exception 'Cette publication ne nécessite plus de validation.';
  end if;
  if v_scheduled_at is not null and v_scheduled_at <= now() then
    raise exception 'La date prévue est passée. Modifie la programmation avant validation.';
  end if;

  update public.social_posts
  set status = case when v_scheduled_at is null then 'draft' else 'scheduled' end,
      approved_by = v_actor,
      approved_at = now(),
      updated_at = now()
  where id = p_post_id;

  update public.social_post_targets t
  set status = case
        when t.social_account_id is null then 'awaiting_connection'
        when t.publication_mode = 'manual' then 'manual_required'
        when t.scheduled_at is null then 'draft'
        else 'scheduled'
      end,
      updated_at = now()
  where t.post_id = p_post_id;

  return jsonb_build_object(
    'ok', true,
    'message', 'Validation enregistrée. Aucune publication externe n’a été lancée.',
    'status', case when v_scheduled_at is null then 'draft' else 'scheduled' end
  );
end;
$function$;

revoke all on function public.sama_approve_social_post(uuid) from public, anon;
grant execute on function public.sama_approve_social_post(uuid) to authenticated;

-- Extension de la liste blanche existante : le propriétaire reste le seul à
-- pouvoir attribuer les droits, via l'éditeur de permissions du back-office.
create or replace function public.sama_update_admin_permissions(p_target_user_id uuid, p_permissions jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_key text;
  v_value jsonb;
  v_label text;
  v_allowed constant text[] := array[
    'dashboard.view','orders.view','orders.update_status','customers.view',
    'prospects.view','prospects.create','prospects.update','prospects.delete',
    'quotes.view','quotes.update_status','sales_codes.view','sales_codes.manage_own',
    'catalog.view','stock.view','stock.update','expenses.submit',
    'social.view','social.manage','social.publish','social.accounts.manage'
  ];
begin
  if v_actor is null or not private.sama_is_owner() then
    raise exception 'Seul le propriétaire peut modifier les permissions.';
  end if;
  if p_target_user_id is null or p_target_user_id = v_actor then
    raise exception 'Sélectionne un administrateur associé.';
  end if;
  if jsonb_typeof(p_permissions) <> 'object' then
    raise exception 'Format de permissions invalide.';
  end if;

  for v_key, v_value in select key, value from jsonb_each(p_permissions) loop
    if not (v_key = any(v_allowed)) then
      raise exception 'Permission non autorisée : %', v_key;
    end if;
    if jsonb_typeof(v_value) <> 'boolean' then
      raise exception 'Chaque permission doit être booléenne.';
    end if;
  end loop;

  select coalesce(p.full_name, p.email, 'Administrateur')
    into v_label
  from public.profiles p
  where p.id = p_target_user_id
    and p.role = 'admin'
    and p.is_super_admin is false;

  if not found then
    raise exception 'Compte introuvable ou protégé.';
  end if;

  perform set_config('sama.allow_admin_permissions_update', 'on', true);
  update public.profiles
  set admin_permissions = p_permissions,
      updated_at = now()
  where id = p_target_user_id
    and role = 'admin'
    and is_super_admin is false;
  perform set_config('sama.allow_admin_permissions_update', 'off', true);

  insert into public.audit_logs(actor_user_id, actor_label, action, entity_type, entity_id, details)
  select v_actor,
         coalesce(p.full_name, p.email, 'Propriétaire'),
         'admin_permissions_updated',
         'profiles',
         p_target_user_id::text,
         jsonb_build_object('target', v_label, 'permissions', p_permissions)
  from public.profiles p
  where p.id = v_actor;

  return jsonb_build_object('ok', true, 'message', 'Permissions enregistrées.');
end;
$function$;
