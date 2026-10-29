-- Avoid recursive RLS between orders, customers and profiles; make client assignment authoritative.
UPDATE public.customers c
SET assigned_admin_id = src.assigned_admin_id
FROM (
  SELECT DISTINCT ON (o.customer_id) o.customer_id,
         coalesce(o.assigned_admin_id,o.sales_referrer_user_id) AS assigned_admin_id
  FROM public.orders o
  WHERE coalesce(o.assigned_admin_id,o.sales_referrer_user_id) IS NOT NULL
  ORDER BY o.customer_id,o.created_at DESC
) src
WHERE c.id=src.customer_id AND c.assigned_admin_id IS NULL;

UPDATE public.orders SET assigned_admin_id=NULL
WHERE assigned_admin_id IS NOT NULL AND assigned_admin_id=sales_referrer_user_id;
UPDATE public.quotes SET assigned_admin_id=NULL
WHERE assigned_admin_id IS NOT NULL AND assigned_admin_id=sales_referrer_user_id;

DROP TRIGGER IF EXISTS sama_assign_order_to_sales_rep ON public.orders;
DROP TRIGGER IF EXISTS sama_assign_quote_to_sales_rep ON public.quotes;
DROP TRIGGER IF EXISTS sama_sync_customer_assignee ON public.orders;
DROP FUNCTION IF EXISTS private.sama_assign_order_to_sales_rep();
DROP FUNCTION IF EXISTS private.sama_assign_quote_to_sales_rep();
DROP FUNCTION IF EXISTS private.sama_sync_customer_assignee();

CREATE OR REPLACE FUNCTION private.sama_can_view_order(p_order_id text,p_permission text DEFAULT 'orders.view')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT EXISTS (
  SELECT 1 FROM public.orders o LEFT JOIN public.customers c ON c.id=o.customer_id
  WHERE o.id=p_order_id AND (
   o.user_id=(SELECT auth.uid()) OR private.sama_is_owner()
   OR (private.sama_has_admin_permission(p_permission) AND (
    o.assigned_admin_id=(SELECT auth.uid())
    OR (o.assigned_admin_id IS NULL AND (
      c.assigned_admin_id=(SELECT auth.uid())
      OR (c.assigned_admin_id IS NULL AND o.sales_referrer_user_id=(SELECT auth.uid()))
    ))
   ))
  )
 );
$function$;

CREATE OR REPLACE FUNCTION private.sama_can_view_customer(p_customer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT EXISTS (
  SELECT 1 FROM public.customers c
  WHERE c.id=p_customer_id AND (
   c.user_id=(SELECT auth.uid()) OR private.sama_is_owner()
   OR (private.sama_has_admin_permission('customers.view') AND (
    c.assigned_admin_id=(SELECT auth.uid())
    OR (c.assigned_admin_id IS NULL AND EXISTS (
      SELECT 1 FROM public.orders o WHERE o.customer_id=c.id AND (
       o.assigned_admin_id=(SELECT auth.uid())
       OR (o.assigned_admin_id IS NULL AND o.sales_referrer_user_id=(SELECT auth.uid()))
      )
    ))
   ))
  )
 );
$function$;

CREATE OR REPLACE FUNCTION private.sama_can_view_customer_profile(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT private.sama_is_owner() OR EXISTS (
  SELECT 1 FROM public.customers c
  WHERE c.user_id=p_user_id
    AND private.sama_has_admin_permission('customers.view')
    AND (
      c.assigned_admin_id=(SELECT auth.uid())
      OR (c.assigned_admin_id IS NULL AND EXISTS (
        SELECT 1 FROM public.orders o WHERE o.customer_id=c.id AND (
          o.assigned_admin_id=(SELECT auth.uid())
          OR (o.assigned_admin_id IS NULL AND o.sales_referrer_user_id=(SELECT auth.uid()))
        )
      ))
    )
 );
$function$;

REVOKE ALL ON FUNCTION private.sama_can_view_order(text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.sama_can_view_customer(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.sama_can_view_customer_profile(uuid) FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.sama_can_view_order(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.sama_can_view_customer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.sama_can_view_customer_profile(uuid) TO authenticated;

DROP POLICY IF EXISTS "profiles self or admin select" ON public.profiles;
DROP POLICY IF EXISTS "profiles self owner or assigned customers select" ON public.profiles;
CREATE POLICY "profiles self owner or assigned customers select" ON public.profiles FOR SELECT TO authenticated
USING (id=(SELECT auth.uid()) OR private.sama_is_owner() OR (role='customer' AND private.sama_can_view_customer_profile(id)));

DROP POLICY IF EXISTS "customer or admin read customer record" ON public.customers;
DROP POLICY IF EXISTS "customer owner or assigned admin read customer record" ON public.customers;
CREATE POLICY "customer owner or assigned admin read customer record" ON public.customers FOR SELECT TO authenticated
USING (private.sama_can_view_customer(id));
DROP POLICY IF EXISTS "owner assign customers" ON public.customers;
CREATE POLICY "owner assign customers" ON public.customers FOR UPDATE TO authenticated
USING (private.sama_is_owner()) WITH CHECK (private.sama_is_owner());

DROP POLICY IF EXISTS "customer or admin read orders" ON public.orders;
DROP POLICY IF EXISTS "customers owner or assigned admin read orders" ON public.orders;
CREATE POLICY "customers owner or assigned admin read orders" ON public.orders FOR SELECT TO authenticated
USING (private.sama_can_view_order(id,'orders.view'));
DROP POLICY IF EXISTS "admin update orders" ON public.orders;
DROP POLICY IF EXISTS "owner or assigned admin update orders" ON public.orders;
CREATE POLICY "owner or assigned admin update orders" ON public.orders FOR UPDATE TO authenticated
USING (private.sama_can_view_order(id,'orders.update_status'))
WITH CHECK (private.sama_can_view_order(id,'orders.update_status'));

DROP POLICY IF EXISTS "customer or admin read order items" ON public.order_items;
DROP POLICY IF EXISTS "customer or assigned admin read order items" ON public.order_items;
CREATE POLICY "customer or assigned admin read order items" ON public.order_items FOR SELECT TO authenticated
USING (private.sama_can_view_order(order_id,'orders.view'));

DROP POLICY IF EXISTS "Admins read customer notifications" ON public.notifications;
DROP POLICY IF EXISTS "owner or associated order admin read notifications" ON public.notifications;
DROP POLICY IF EXISTS "owner recipient or assigned admin read notifications" ON public.notifications;
CREATE POLICY "owner recipient or assigned admin read notifications" ON public.notifications FOR SELECT TO authenticated
USING (private.sama_is_owner() OR recipient_user_id=(SELECT auth.uid())
 OR (private.sama_has_admin_permission('orders.view') AND entity_type='order' AND private.sama_can_view_order(entity_id,'orders.view')));

DROP POLICY IF EXISTS "owner or own admin read sales codes" ON public.sales_referral_codes;
CREATE POLICY "owner or own admin read sales codes" ON public.sales_referral_codes FOR SELECT TO authenticated
USING (private.sama_is_owner() OR (private.sama_has_admin_permission('sales_codes.view') AND owner_user_id=(SELECT auth.uid())));

-- Stock purchase costs are retrieved through an owner-only RPC because column grants cannot vary per user.
CREATE OR REPLACE FUNCTION public.sama_get_stock_costs()
RETURNS TABLE(product_id text,unit_cost numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
 IF NOT private.sama_is_owner() THEN RAISE EXCEPTION 'Les coûts de stock sont réservés au propriétaire.'; END IF;
 RETURN QUERY SELECT s.product_id,s.unit_cost FROM public.stock s ORDER BY s.product_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.sama_get_stock_costs() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sama_get_stock_costs() TO authenticated;
