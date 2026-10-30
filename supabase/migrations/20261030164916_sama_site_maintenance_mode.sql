create table if not exists public.site_control (
  id boolean primary key default true check (id = true),
  maintenance_mode boolean not null default false,
  maintenance_message text not null default 'Notre site est temporairement indisponible pour une opération de maintenance. Nous serons de retour très bientôt.',
  updated_at timestamptz not null default now()
);

insert into public.site_control (id)
values (true)
on conflict (id) do nothing;

alter table public.site_control enable row level security;

revoke all on table public.site_control from public, anon, authenticated, service_role;
grant select on table public.site_control to anon, authenticated;
grant update on table public.site_control to authenticated;
grant all on table public.site_control to service_role;

drop policy if exists "public read site control" on public.site_control;
create policy "public read site control"
on public.site_control
for select
to anon, authenticated
using (id = true);

drop policy if exists "owner update site control" on public.site_control;
create policy "owner update site control"
on public.site_control
for update
to authenticated
using (private.sama_is_owner())
with check (private.sama_is_owner());
