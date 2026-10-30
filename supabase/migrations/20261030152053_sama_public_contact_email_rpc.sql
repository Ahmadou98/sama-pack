-- Expose only the public-facing contact email, not the full notification settings row.
CREATE OR REPLACE FUNCTION public.sama_public_contact_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT nullif(btrim(ns.order_notification_email), '')
  FROM public.notification_settings AS ns
  WHERE ns.id IS TRUE
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.sama_public_contact_email() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sama_public_contact_email() TO anon, authenticated;

COMMENT ON FUNCTION public.sama_public_contact_email()
IS 'Returns only the public SAMA-PACK contact email; does not expose notification settings or delivery controls.';
