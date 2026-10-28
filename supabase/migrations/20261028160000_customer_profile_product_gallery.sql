-- SAMA-PACK: reusable customer delivery profiles and product image galleries.
alter table public.profiles
  add column if not exists phone_secondary text not null default '',
  add column if not exists delivery_region text not null default '',
  add column if not exists delivery_city text not null default '',
  add column if not exists delivery_commune text not null default '',
  add column if not exists delivery_neighborhood text not null default '',
  add column if not exists delivery_address text not null default '',
  add column if not exists delivery_landmark text not null default '',
  add column if not exists delivery_instructions text not null default '';

alter table public.products
  add column if not exists image_paths text[] not null default '{}'::text[];

update public.products
set image_paths = array[image_path]
where cardinality(image_paths) = 0
  and nullif(trim(image_path), '') is not null;

create or replace function public.sama_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name text;
  v_phone text;
  v_secondary text;
begin
  v_name := left(coalesce(nullif(trim(v_meta->>'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1), 'Client'), 120);
  v_phone := left(regexp_replace(coalesce(v_meta->>'phone', ''), '[^0-9]', '', 'g'), 30);
  v_secondary := left(regexp_replace(coalesce(v_meta->>'phone_secondary', ''), '[^0-9]', '', 'g'), 30);

  if v_meta->>'account_type' = 'customer' then
    if length(v_phone) < 8 or length(v_phone) > 15 or left(v_phone, 1) = '0' then
      raise exception 'Un numéro WhatsApp valide avec indicatif international est obligatoire.';
    end if;
    if length(v_name) < 2
      or nullif(trim(v_meta->>'delivery_region'), '') is null
      or nullif(trim(v_meta->>'delivery_city'), '') is null
      or nullif(trim(v_meta->>'delivery_commune'), '') is null
      or nullif(trim(v_meta->>'delivery_neighborhood'), '') is null
      or nullif(trim(v_meta->>'delivery_address'), '') is null then
      raise exception 'Le profil client doit contenir une adresse de livraison complète.';
    end if;
  end if;

  insert into public.profiles(
    id, full_name, phone, phone_secondary, delivery_region, delivery_city,
    delivery_commune, delivery_neighborhood, delivery_address, delivery_landmark,
    delivery_instructions, email, role
  )
  values(
    new.id, v_name, v_phone, v_secondary,
    left(coalesce(v_meta->>'delivery_region', ''), 100),
    left(coalesce(v_meta->>'delivery_city', ''), 100),
    left(coalesce(v_meta->>'delivery_commune', ''), 100),
    left(coalesce(v_meta->>'delivery_neighborhood', ''), 120),
    left(coalesce(v_meta->>'delivery_address', ''), 300),
    left(coalesce(v_meta->>'delivery_landmark', ''), 200),
    left(coalesce(v_meta->>'delivery_instructions', ''), 500),
    coalesce(new.email, ''), 'customer'
  )
  on conflict (id) do update set
    full_name = case when public.profiles.full_name = '' then excluded.full_name else public.profiles.full_name end,
    phone = case when public.profiles.phone = '' then excluded.phone else public.profiles.phone end,
    phone_secondary = case when public.profiles.phone_secondary = '' then excluded.phone_secondary else public.profiles.phone_secondary end,
    delivery_region = case when public.profiles.delivery_region = '' then excluded.delivery_region else public.profiles.delivery_region end,
    delivery_city = case when public.profiles.delivery_city = '' then excluded.delivery_city else public.profiles.delivery_city end,
    delivery_commune = case when public.profiles.delivery_commune = '' then excluded.delivery_commune else public.profiles.delivery_commune end,
    delivery_neighborhood = case when public.profiles.delivery_neighborhood = '' then excluded.delivery_neighborhood else public.profiles.delivery_neighborhood end,
    delivery_address = case when public.profiles.delivery_address = '' then excluded.delivery_address else public.profiles.delivery_address end,
    delivery_landmark = case when public.profiles.delivery_landmark = '' then excluded.delivery_landmark else public.profiles.delivery_landmark end,
    delivery_instructions = case when public.profiles.delivery_instructions = '' then excluded.delivery_instructions else public.profiles.delivery_instructions end,
    email = excluded.email,
    updated_at = now();
  return new;
end;
$function$;

create or replace function public.sama_protect_profile_identity()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v_phone text;
  v_secondary text;
begin
  if auth.uid() is not null then
    -- Profile editing must never grant privileges or change the account email.
    new.email := old.email;
    new.role := old.role;
    new.is_super_admin := old.is_super_admin;
    new.invited_by := old.invited_by;

    if new.phone is distinct from old.phone then
      v_phone := regexp_replace(coalesce(new.phone, ''), '[^0-9]', '', 'g');
      if length(v_phone) < 8 or length(v_phone) > 15 or left(v_phone, 1) = '0' then
        raise exception 'Le numéro WhatsApp doit être valide et inclure son indicatif international.';
      end if;
      new.phone := v_phone;
    end if;

    if new.phone_secondary is distinct from old.phone_secondary and nullif(trim(coalesce(new.phone_secondary, '')), '') is not null then
      v_secondary := regexp_replace(new.phone_secondary, '[^0-9]', '', 'g');
      if length(v_secondary) < 8 or length(v_secondary) > 15 or left(v_secondary, 1) = '0' then
        raise exception 'Le numéro supplémentaire doit être valide et inclure son indicatif international.';
      end if;
      new.phone_secondary := v_secondary;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists sama_protect_profile_identity on public.profiles;
create trigger sama_protect_profile_identity
before update on public.profiles
for each row execute function public.sama_protect_profile_identity();
