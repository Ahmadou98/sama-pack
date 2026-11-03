-- Restrict stock-update administrators to availability changes only.
-- Product prices, promotions, product metadata and reference prices remain owner-only.

CREATE OR REPLACE FUNCTION private.sama_guard_product_stock_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR private.sama_is_owner() THEN
    RETURN NEW;
  END IF;

  IF private.sama_has_admin_permission('stock.update')
     AND (to_jsonb(NEW) - 'availability_status' - 'updated_at')
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - 'availability_status' - 'updated_at')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Seul le propriétaire peut modifier les prix et les informations du catalogue.'
    USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS products_stock_update_guard ON public.products;

CREATE TRIGGER products_stock_update_guard
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION private.sama_guard_product_stock_updates();

COMMENT ON FUNCTION private.sama_guard_product_stock_updates() IS
  'Empêche les administrateurs non propriétaires de modifier les champs du catalogue via le droit stock.update. Seule la disponibilité est autorisée.';
