REVOKE ALL ON FUNCTION public.sama_provision_courier_profile(uuid, text, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.sama_provision_courier_profile(uuid, text, text, text) TO authenticated;
