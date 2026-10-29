-- The active storefront uses public.sama_place_order for authenticated checkout.
-- Retire the old guest order RPC, which is not referenced by the current frontend.
REVOKE EXECUTE ON FUNCTION public.sama_create_order(jsonb) FROM PUBLIC, anon, authenticated;
