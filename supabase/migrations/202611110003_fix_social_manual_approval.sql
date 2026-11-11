-- Les cibles manuelles ne nécessitent pas de compte API connecté.
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
        when t.provider = 'tiktok' or t.publication_mode = 'manual' then 'manual_required'
        when t.social_account_id is null then 'awaiting_connection'
        when t.scheduled_at is null then 'draft'
        else 'scheduled'
      end,
      updated_at = now()
  where t.post_id = p_post_id;

  return jsonb_build_object(
    'ok', true,
    'message', 'Validation enregistrée. Les cibles automatiques seront envoyées à leur échéance ; les cibles manuelles restent à publier sur leur plateforme.',
    'status', case when v_scheduled_at is null then 'draft' else 'scheduled' end
  );
end;
$function$;

revoke all on function public.sama_approve_social_post(uuid) from public, anon;
grant execute on function public.sama_approve_social_post(uuid) to authenticated;
