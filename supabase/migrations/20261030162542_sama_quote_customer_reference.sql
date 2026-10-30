CREATE OR REPLACE FUNCTION public.sama_create_quote(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_id text;
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_code text := upper(regexp_replace(coalesce(p_payload->>'sales_referral_code',''), '[^A-Za-z0-9_-]', '', 'g'));
  v_referrer uuid;
begin
  if coalesce(btrim(p_payload->>'company'),'') = ''
     or coalesce(btrim(p_payload->>'need'),'') = '' then
    raise exception 'Entreprise et besoin obligatoires';
  end if;

  if nullif(p_payload->>'business_account_id','') is not null then
    begin v_business_id := (p_payload->>'business_account_id')::uuid;
    exception when others then raise exception 'Compte professionnel invalide.'; end;
    if not exists(select 1 from public.business_accounts b where b.id = v_business_id and b.owner_user_id = v_user_id) then
      raise exception 'Ce compte professionnel ne vous appartient pas.';
    end if;
  end if;

  select c.owner_user_id into v_referrer
  from public.sales_referral_codes c where c.active and c.code = v_code;
  if v_referrer is null then v_code := null; end if;

  -- The customer cannot choose or inject an internal quote identifier.
  v_id := 'DV-' || to_char(now() at time zone 'Africa/Dakar', 'YYYYMMDD')
          || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.quotes(
    id, company, phone, email, need, message, status, user_id,
    business_account_id, sales_referral_code, sales_referrer_user_id
  )
  values(
    v_id,
    left(btrim(p_payload->>'company'),150),
    left(coalesce(p_payload->>'phone',''),30),
    left(coalesce(p_payload->>'email',''),254),
    left(btrim(p_payload->>'need'),250),
    left(coalesce(p_payload->>'message',''),2000),
    'new',
    v_user_id,
    v_business_id,
    v_code,
    v_referrer
  );

  insert into public.activity(action, detail)
  values('Demande de devis', v_id);

  return jsonb_build_object('ok',true,'id',v_id);
end;
$function$;

COMMENT ON FUNCTION public.sama_create_quote(jsonb)
IS 'Creates a B2B quote request with a server-generated customer reference; ignores caller-supplied identifiers.';
