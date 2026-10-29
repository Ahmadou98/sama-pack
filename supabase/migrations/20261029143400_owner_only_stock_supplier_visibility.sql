
CREATE OR REPLACE FUNCTION public.sama_get_stock_procurement()
RETURNS TABLE(product_id text,unit_cost numeric,supplier text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
 IF NOT private.sama_is_owner() THEN
   RAISE EXCEPTION 'Les données d’approvisionnement sont réservées au propriétaire.';
 END IF;
 RETURN QUERY SELECT s.product_id,s.unit_cost,s.supplier FROM public.stock s ORDER BY s.product_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.sama_get_stock_procurement() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sama_get_stock_procurement() TO authenticated;

REVOKE SELECT(supplier),INSERT(supplier),UPDATE(supplier)
ON public.stock FROM PUBLIC,anon,authenticated;
