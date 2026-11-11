-- Rollback complet du module Social Desk SAMA-PACK.
-- Ne touche ni aux comptes sociaux externes, ni aux autres données du site.

do $cleanup$
begin
  if exists (
    select 1 from storage.objects where bucket_id = 'sama-social-media'
  ) then
    raise exception 'Le bucket social contient encore des fichiers ; arrêt du nettoyage pour éviter toute perte de média.';
  end if;
end;
$cleanup$;

-- Arrêt immédiat du traitement périodique.
select cron.unschedule(jobid)
from cron.job
where jobname = 'sama-pack-social-publisher';

-- Retrait des droits sociaux éventuellement enregistrés sur les profils.
update public.profiles
set admin_permissions = coalesce(admin_permissions, '{}'::jsonb)
  - array['social.view','social.manage','social.publish','social.accounts.manage']::text[]
where coalesce(admin_permissions, '{}'::jsonb)
  ?| array['social.view','social.manage','social.publish','social.accounts.manage'];

-- Les fonctions de publication sont supprimées avant leurs tables dépendantes.
drop function if exists public.sama_approve_social_post(uuid);
drop function if exists public.sama_claim_social_targets(integer);
drop function if exists public.sama_get_social_token_encryption_key();
drop function if exists public.sama_get_social_worker_token();

-- Retrait des politiques et du bucket dédié (le contrôle ci-dessus garantit qu'il est vide).
drop policy if exists sama_social_media_read on storage.objects;
drop policy if exists sama_social_media_insert on storage.objects;
drop policy if exists sama_social_media_delete on storage.objects;
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.buckets where id = 'sama-social-media';

-- Suppression des clés de chiffrement/worker créées exclusivement pour Social Desk.
delete from vault.secrets
where name in ('sama_social_token_encryption_key','sama_social_worker_token');

-- Suppression des tables dédiées et de leurs politiques/index/FK.
drop table if exists public.social_oauth_states cascade;
drop table if exists public.social_credentials cascade;
drop table if exists public.social_post_targets cascade;
drop table if exists public.social_posts cascade;
drop table if exists public.social_media_assets cascade;
drop table if exists public.social_accounts cascade;

-- Restauration de la liste de permissions antérieure à Social Desk.
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
    'catalog.view','stock.view','stock.update','expenses.submit'
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
