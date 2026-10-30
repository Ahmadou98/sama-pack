CREATE OR REPLACE FUNCTION public.sama_provision_courier_profile(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_phone text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_owner boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Session invalide. Reconnecte-toi avant de finaliser cette invitation.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_actor
      AND p.role = 'admin'
      AND p.is_super_admin IS TRUE
  ) INTO v_owner;

  IF NOT v_owner THEN
    RAISE EXCEPTION 'Seul l’administrateur général peut créer un profil livreur.';
  END IF;

  IF p_user_id IS NULL
     OR nullif(trim(coalesce(p_email, '')), '') IS NULL
     OR nullif(trim(coalesce(p_full_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informations du livreur incomplètes.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = p_user_id
      AND lower(u.email) = lower(trim(p_email))
  ) THEN
    RAISE EXCEPTION 'Le compte Auth du livreur ne correspond pas à cette invitation.';
  END IF;

  INSERT INTO public.profiles (
    id, email, full_name, phone, role, is_super_admin, invited_by
  )
  VALUES (
    p_user_id, lower(trim(p_email)), trim(p_full_name),
    coalesce(nullif(trim(coalesce(p_phone, '')), ''), ''),
    'courier', false, v_actor
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    phone = CASE
      WHEN nullif(EXCLUDED.phone, '') IS NULL THEN public.profiles.phone
      ELSE EXCLUDED.phone
    END,
    role = 'courier',
    is_super_admin = false,
    invited_by = v_actor;
END;
$function$;
