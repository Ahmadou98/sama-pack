CREATE OR REPLACE FUNCTION public.sama_protect_profile_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_phone text;
  v_secondary text;
  v_is_owner boolean := false;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.is_super_admin IS TRUE
    ) INTO v_is_owner;

    new.email := old.email;

    IF NOT v_is_owner THEN
      new.role := old.role;
      new.is_super_admin := old.is_super_admin;
      new.invited_by := old.invited_by;
    END IF;

    IF new.phone IS DISTINCT FROM old.phone THEN
      v_phone := regexp_replace(coalesce(new.phone, ''), '[^0-9]', '', 'g');
      IF length(v_phone) < 8 OR length(v_phone) > 15 OR left(v_phone, 1) = '0' THEN
        RAISE EXCEPTION 'Le numéro WhatsApp doit être valide et inclure son indicatif international.';
      END IF;
      new.phone := v_phone;
    END IF;

    IF new.phone_secondary IS DISTINCT FROM old.phone_secondary
       AND nullif(trim(coalesce(new.phone_secondary, '')), '') IS NOT NULL THEN
      v_secondary := regexp_replace(new.phone_secondary, '[^0-9]', '', 'g');
      IF length(v_secondary) < 8 OR length(v_secondary) > 15 OR left(v_secondary, 1) = '0' THEN
        RAISE EXCEPTION 'Le numéro supplémentaire doit être valide et inclure son indicatif international.';
      END IF;
      new.phone_secondary := v_secondary;
    END IF;
  END IF;

  new.updated_at := now();
  RETURN new;
END;
$function$;

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
    nullif(trim(coalesce(p_phone, '')), ''), 'courier', false, v_actor
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    phone = CASE
      WHEN EXCLUDED.phone IS NULL THEN public.profiles.phone
      ELSE EXCLUDED.phone
    END,
    role = 'courier',
    is_super_admin = false,
    invited_by = v_actor;
END;
$function$;

REVOKE ALL ON FUNCTION public.sama_provision_courier_profile(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sama_provision_courier_profile(uuid, text, text, text) TO authenticated;
