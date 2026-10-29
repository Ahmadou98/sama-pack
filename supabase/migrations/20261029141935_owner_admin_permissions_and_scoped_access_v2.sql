-- SAMA-PACK owner-controlled permissions and scoped associate access.
-- Keeps global platform, finance, supplier costs, publication, audit and account controls owner-only.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS admin_permissions jsonb NOT NULL DEFAULT
'{"dashboard.view":true,"orders.view":true,"orders.update_status":true,"customers.view":true,"prospects.view":true,"prospects.create":true,"prospects.update":true,"prospects.delete":true,"quotes.view":true,"quotes.update_status":true,"sales_codes.view":true,"sales_codes.manage_own":true,"catalog.view":true,"stock.view":true,"stock.update":true,"expenses.submit":true}'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS assigned_admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS assigned_admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_approval_status_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_approval_status_check CHECK (approval_status IN ('pending','approved','rejected'));

CREATE INDEX IF NOT EXISTS orders_assigned_admin_id_idx ON public.orders(assigned_admin_id);
CREATE INDEX IF NOT EXISTS quotes_assigned_admin_id_idx ON public.quotes(assigned_admin_id);
CREATE INDEX IF NOT EXISTS customers_assigned_admin_id_idx ON public.customers(assigned_admin_id);
CREATE INDEX IF NOT EXISTS expenses_submitted_by_idx ON public.expenses(submitted_by);

UPDATE public.orders o SET assigned_admin_id=o.sales_referrer_user_id
WHERE o.assigned_admin_id IS NULL AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=o.sales_referrer_user_id AND p.role='admin' AND p.is_super_admin IS FALSE);
UPDATE public.quotes q SET assigned_admin_id=q.sales_referrer_user_id
WHERE q.assigned_admin_id IS NULL AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=q.sales_referrer_user_id AND p.role='admin' AND p.is_super_admin IS FALSE);
UPDATE public.customers c SET assigned_admin_id=s.assigned_admin_id
FROM (SELECT DISTINCT ON(o.customer_id) o.customer_id,coalesce(o.assigned_admin_id,o.sales_referrer_user_id) assigned_admin_id
      FROM public.orders o WHERE coalesce(o.assigned_admin_id,o.sales_referrer_user_id) IS NOT NULL ORDER BY o.customer_id,o.created_at DESC) s
WHERE c.id=s.customer_id AND c.assigned_admin_id IS NULL;

CREATE OR REPLACE FUNCTION private.sama_is_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$ SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='admin' AND p.is_super_admin IS TRUE); $f$;
CREATE OR REPLACE FUNCTION private.sama_has_admin_permission(p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$ SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='admin'
  AND (p.is_super_admin IS TRUE OR coalesce(p.admin_permissions->>p_permission,'false')='true')); $f$;
REVOKE ALL ON FUNCTION private.sama_is_owner() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.sama_has_admin_permission(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sama_is_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION private.sama_has_admin_permission(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sama_update_admin_permissions(p_target_user_id uuid,p_permissions jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE v_actor uuid:=auth.uid(); v_key text; v_value jsonb; v_label text;
v_allowed constant text[]:=ARRAY['dashboard.view','orders.view','orders.update_status','customers.view','prospects.view','prospects.create','prospects.update','prospects.delete','quotes.view','quotes.update_status','sales_codes.view','sales_codes.manage_own','catalog.view','stock.view','stock.update','expenses.submit'];
BEGIN
 IF v_actor IS NULL OR NOT private.sama_is_owner() THEN RAISE EXCEPTION 'Seul le propriétaire peut modifier les permissions.'; END IF;
 IF p_target_user_id IS NULL OR p_target_user_id=v_actor THEN RAISE EXCEPTION 'Sélectionne un administrateur associé.'; END IF;
 IF jsonb_typeof(p_permissions)<>'object' THEN RAISE EXCEPTION 'Format de permissions invalide.'; END IF;
 FOR v_key,v_value IN SELECT key,value FROM jsonb_each(p_permissions) LOOP
  IF NOT(v_key=ANY(v_allowed)) THEN RAISE EXCEPTION 'Permission non autorisée : %',v_key; END IF;
  IF jsonb_typeof(v_value)<>'boolean' THEN RAISE EXCEPTION 'Chaque permission doit être booléenne.'; END IF;
 END LOOP;
 SELECT coalesce(p.full_name,p.email,'Administrateur') INTO v_label FROM public.profiles p WHERE p.id=p_target_user_id AND p.role='admin' AND p.is_super_admin IS FALSE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Compte introuvable ou protégé.'; END IF;
 PERFORM set_config('sama.allow_admin_permissions_update','on',true);
 UPDATE public.profiles SET admin_permissions=p_permissions,updated_at=now() WHERE id=p_target_user_id AND role='admin' AND is_super_admin IS FALSE;
 PERFORM set_config('sama.allow_admin_permissions_update','off',true);
 INSERT INTO public.audit_logs(actor_user_id,actor_label,action,entity_type,entity_id,details)
 SELECT v_actor,coalesce(p.full_name,p.email,'Propriétaire'),'admin_permissions_updated','profiles',p_target_user_id::text,
 jsonb_build_object('target',v_label,'permissions',p_permissions) FROM public.profiles p WHERE p.id=v_actor;
 RETURN jsonb_build_object('ok',true,'message','Permissions enregistrées.');
END; $f$;
REVOKE ALL ON FUNCTION public.sama_update_admin_permissions(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sama_update_admin_permissions(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION private.sama_protect_admin_metadata()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp'
AS $f$
DECLARE v_jwt_role text:=coalesce(current_setting('request.jwt.claim.role',true),''); v_is_owner boolean:=false;
v_permission_update boolean:=coalesce(current_setting('sama.allow_admin_permissions_update',true),'')='on';
BEGIN
 IF v_jwt_role IN ('service_role','supabase_admin','postgres') OR current_user IN ('postgres','supabase_admin') THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Session invalide.'; END IF;
 IF NEW.admin_permissions IS DISTINCT FROM OLD.admin_permissions THEN
  IF NOT v_permission_update THEN RAISE EXCEPTION 'Les permissions doivent être modifiées par le propriétaire.'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='admin' AND p.is_super_admin IS TRUE) INTO v_is_owner;
  IF NOT v_is_owner THEN RAISE EXCEPTION 'Seul le propriétaire peut modifier les permissions.'; END IF;
 END IF;
 IF OLD.is_super_admin THEN
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin OR NEW.invited_by IS DISTINCT FROM OLD.invited_by THEN RAISE EXCEPTION 'Les droits du propriétaire sont protégés.'; END IF;
  RETURN NEW;
 END IF;
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='admin' AND p.is_super_admin IS TRUE) INTO v_is_owner;
 IF NOT v_is_owner AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin OR NEW.invited_by IS DISTINCT FROM OLD.invited_by) THEN
  RAISE EXCEPTION 'Seul le propriétaire peut gérer les droits administrateur.';
 END IF;
 RETURN NEW;
END; $f$;
DROP TRIGGER IF EXISTS profiles_protect_admin_metadata ON public.profiles;
CREATE TRIGGER profiles_protect_admin_metadata BEFORE UPDATE OF role,is_super_admin,invited_by,admin_permissions ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.sama_protect_admin_metadata();

CREATE OR REPLACE FUNCTION private.sama_can_view_all_prospects()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$ SELECT private.sama_is_owner(); $f$;

DROP POLICY IF EXISTS "profiles self or admin select" ON public.profiles;
DROP POLICY IF EXISTS "profiles self owner or assigned customers select" ON public.profiles;
CREATE POLICY "profiles self owner or assigned customers select" ON public.profiles FOR SELECT TO authenticated USING(
 id=(SELECT auth.uid()) OR private.sama_is_owner() OR
 (role='customer' AND private.sama_has_admin_permission('customers.view') AND (
  EXISTS(SELECT 1 FROM public.customers c WHERE c.user_id=profiles.id AND c.assigned_admin_id=(SELECT auth.uid()))
  OR EXISTS(SELECT 1 FROM public.orders o WHERE o.user_id=profiles.id AND coalesce(o.assigned_admin_id,o.sales_referrer_user_id)=(SELECT auth.uid()))
 ))
);
DROP POLICY IF EXISTS "customer or admin read orders" ON public.orders;
DROP POLICY IF EXISTS "customers owner or assigned admin read orders" ON public.orders;
CREATE POLICY "customers owner or assigned admin read orders" ON public.orders FOR SELECT TO authenticated USING(
 user_id=(SELECT auth.uid()) OR private.sama_is_owner() OR
 (private.sama_has_admin_permission('orders.view') AND coalesce(assigned_admin_id,sales_referrer_user_id)=(SELECT auth.uid()))
);
DROP POLICY IF EXISTS "admin update orders" ON public.orders;
DROP POLICY IF EXISTS "owner or assigned admin update orders" ON public.orders;
CREATE POLICY "owner or assigned admin update orders" ON public.orders FOR UPDATE TO authenticated
USING(private.sama_is_owner() OR (private.sama_has_admin_permission('orders.update_status') AND coalesce(assigned_admin_id,sales_referrer_user_id)=(SELECT auth.uid())))
WITH CHECK(private.sama_is_owner() OR (private.sama_has_admin_permission('orders.update_status') AND coalesce(assigned_admin_id,sales_referrer_user_id)=(SELECT auth.uid())));

CREATE OR REPLACE FUNCTION private.sama_guard_order_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
BEGIN
 IF coalesce(current_setting('request.jwt.claim.role',true),'') IN ('service_role','supabase_admin','postgres') OR private.sama_is_owner() THEN RETURN NEW; END IF;
 IF NEW.assigned_admin_id IS DISTINCT FROM OLD.assigned_admin_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.user_id IS DISTINCT FROM OLD.user_id
 OR NEW.sales_referrer_user_id IS DISTINCT FROM OLD.sales_referrer_user_id OR NEW.sales_referral_code IS DISTINCT FROM OLD.sales_referral_code
 OR NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.delivery IS DISTINCT FROM OLD.delivery OR NEW.total IS DISTINCT FROM OLD.total
 OR NEW.amount_paid IS DISTINCT FROM OLD.amount_paid OR NEW.payment_status IS DISTINCT FROM OLD.payment_status OR NEW.payment_choice IS DISTINCT FROM OLD.payment_choice
 OR NEW.payment IS DISTINCT FROM OLD.payment OR NEW.delivery_cost_actual IS DISTINCT FROM OLD.delivery_cost_actual OR NEW.payment_fee_percent IS DISTINCT FROM OLD.payment_fee_percent
 OR NEW.customer_name IS DISTINCT FROM OLD.customer_name OR NEW.customer_phone IS DISTINCT FROM OLD.customer_phone OR NEW.delivery_address IS DISTINCT FROM OLD.delivery_address
 OR NEW.delivery_zone IS DISTINCT FROM OLD.delivery_zone OR NEW.slot IS DISTINCT FROM OLD.slot OR NEW.created_at IS DISTINCT FROM OLD.created_at
 THEN RAISE EXCEPTION 'Un associé peut uniquement modifier le statut de sa commande attribuée.'; END IF;
 RETURN NEW;
END; $f$;
DROP TRIGGER IF EXISTS sama_guard_order_update ON public.orders;
CREATE TRIGGER sama_guard_order_update BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION private.sama_guard_order_update();

CREATE OR REPLACE FUNCTION private.sama_assign_order_to_sales_rep()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$ BEGIN
 IF NEW.assigned_admin_id IS NULL AND NEW.sales_referrer_user_id IS NOT NULL AND EXISTS(
 SELECT 1 FROM public.profiles p WHERE p.id=NEW.sales_referrer_user_id AND p.role='admin' AND p.is_super_admin IS FALSE) THEN NEW.assigned_admin_id:=NEW.sales_referrer_user_id; END IF;
 RETURN NEW;
END; $f$;
DROP TRIGGER IF EXISTS sama_assign_order_to_sales_rep ON public.orders;
CREATE TRIGGER sama_assign_order_to_sales_rep BEFORE INSERT OR UPDATE OF sales_referrer_user_id ON public.orders FOR EACH ROW EXECUTE FUNCTION private.sama_assign_order_to_sales_rep();

CREATE OR REPLACE FUNCTION private.sama_sync_customer_assignee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$ BEGIN
 IF NEW.assigned_admin_id IS DISTINCT FROM OLD.assigned_admin_id THEN
 UPDATE public.customers SET assigned_admin_id=NEW.assigned_admin_id,updated_at=now() WHERE id=NEW.customer_id AND assigned_admin_id IS DISTINCT FROM NEW.assigned_admin_id;
 END IF; RETURN NEW;
END; $f$;
DROP TRIGGER IF EXISTS sama_sync_customer_assignee ON public.orders;
CREATE TRIGGER sama_sync_customer_assignee AFTER UPDATE OF assigned_admin_id ON public.orders FOR EACH ROW EXECUTE FUNCTION private.sama_sync_customer_assignee();

CREATE OR REPLACE FUNCTION private.sama_sync_orders_assignee_from_customer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$ BEGIN
 IF NEW.assigned_admin_id IS DISTINCT FROM OLD.assigned_admin_id THEN
 UPDATE public.orders SET assigned_admin_id=NEW.assigned_admin_id,updated_at=now() WHERE customer_id=NEW.id AND assigned_admin_id IS DISTINCT FROM NEW.assigned_admin_id;
 END IF; RETURN NEW;
END; $f$;
DROP TRIGGER IF EXISTS sama_sync_orders_assignee_from_customer ON public.customers;
CREATE TRIGGER sama_sync_orders_assignee_from_customer AFTER UPDATE OF assigned_admin_id ON public.customers FOR EACH ROW EXECUTE FUNCTION private.sama_sync_orders_assignee_from_customer();

DROP POLICY IF EXISTS "customer or admin read order items" ON public.order_items;
DROP POLICY IF EXISTS "customer or assigned admin read order items" ON public.order_items;
CREATE POLICY "customer or assigned admin read order items" ON public.order_items FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.orders o WHERE o.id=order_items.order_id AND (
 o.user_id=(SELECT auth.uid()) OR private.sama_is_owner() OR
 (private.sama_has_admin_permission('orders.view') AND coalesce(o.assigned_admin_id,o.sales_referrer_user_id)=(SELECT auth.uid()))
 )));
DROP POLICY IF EXISTS "customer or admin read customer record" ON public.customers;
DROP POLICY IF EXISTS "customer owner or assigned admin read customer record" ON public.customers;
CREATE POLICY "customer owner or assigned admin read customer record" ON public.customers FOR SELECT TO authenticated USING(
 user_id=(SELECT auth.uid()) OR private.sama_is_owner() OR
 (private.sama_has_admin_permission('customers.view') AND assigned_admin_id=(SELECT auth.uid())));
DROP POLICY IF EXISTS "owner assign customers" ON public.customers;
CREATE POLICY "owner assign customers" ON public.customers FOR UPDATE TO authenticated USING(private.sama_is_owner()) WITH CHECK(private.sama_is_owner());

DROP POLICY IF EXISTS "admin insert products" ON public.products;
DROP POLICY IF EXISTS "owner insert products" ON public.products;
CREATE POLICY "owner insert products" ON public.products FOR INSERT TO authenticated WITH CHECK(private.sama_is_owner());
DROP POLICY IF EXISTS "admin update products" ON public.products;
DROP POLICY IF EXISTS "owner or authorized stock update products" ON public.products;
CREATE POLICY "owner or authorized stock update products" ON public.products FOR UPDATE TO authenticated
USING(private.sama_is_owner() OR (active IS TRUE AND private.sama_has_admin_permission('stock.update')))
WITH CHECK(private.sama_is_owner() OR (active IS TRUE AND private.sama_has_admin_permission('stock.update')));
CREATE OR REPLACE FUNCTION private.sama_guard_product_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$ BEGIN
 IF coalesce(current_setting('request.jwt.claim.role',true),'') IN ('service_role','supabase_admin','postgres') OR private.sama_is_owner() THEN RETURN NEW; END IF;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.name IS DISTINCT FROM OLD.name OR NEW.category IS DISTINCT FROM OLD.category OR NEW.price IS DISTINCT FROM OLD.price
 OR NEW.description IS DISTINCT FROM OLD.description OR NEW.items IS DISTINCT FROM OLD.items OR NEW.image_path IS DISTINCT FROM OLD.image_path
 OR NEW.image_paths IS DISTINCT FROM OLD.image_paths OR NEW.active IS DISTINCT FROM OLD.active OR NEW.promo_active IS DISTINCT FROM OLD.promo_active
 OR NEW.promo_price IS DISTINCT FROM OLD.promo_price OR NEW.promo_label IS DISTINCT FROM OLD.promo_label OR NEW.promo_end_at IS DISTINCT FROM OLD.promo_end_at
 OR NEW.catalog_type IS DISTINCT FROM OLD.catalog_type OR NEW.brand IS DISTINCT FROM OLD.brand OR NEW.public_ref IS DISTINCT FROM OLD.public_ref
 THEN RAISE EXCEPTION 'Seul le propriétaire peut modifier le catalogue public, les prix et les promotions.'; END IF;
 RETURN NEW;
END; $f$;
DROP TRIGGER IF EXISTS sama_guard_product_update ON public.products;
CREATE TRIGGER sama_guard_product_update BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION private.sama_guard_product_update();

DROP POLICY IF EXISTS "product costs admin select" ON public.product_costs;
DROP POLICY IF EXISTS "product costs admin insert" ON public.product_costs;
DROP POLICY IF EXISTS "product costs admin update" ON public.product_costs;
DROP POLICY IF EXISTS "product costs admin delete" ON public.product_costs;
DROP POLICY IF EXISTS "owner read product costs" ON public.product_costs;
DROP POLICY IF EXISTS "owner insert product costs" ON public.product_costs;
DROP POLICY IF EXISTS "owner update product costs" ON public.product_costs;
DROP POLICY IF EXISTS "owner delete product costs" ON public.product_costs;
CREATE POLICY "owner read product costs" ON public.product_costs FOR SELECT TO authenticated USING(private.sama_is_owner());
CREATE POLICY "owner insert product costs" ON public.product_costs FOR INSERT TO authenticated WITH CHECK(private.sama_is_owner());
CREATE POLICY "owner update product costs" ON public.product_costs FOR UPDATE TO authenticated USING(private.sama_is_owner()) WITH CHECK(private.sama_is_owner());
CREATE POLICY "owner delete product costs" ON public.product_costs FOR DELETE TO authenticated USING(private.sama_is_owner());

DROP POLICY IF EXISTS "product supplier links admin select" ON public.product_supplier_links;
DROP POLICY IF EXISTS "product supplier links admin insert" ON public.product_supplier_links;
DROP POLICY IF EXISTS "product supplier links admin update" ON public.product_supplier_links;
DROP POLICY IF EXISTS "product supplier links admin delete" ON public.product_supplier_links;
DROP POLICY IF EXISTS "owner read product supplier links" ON public.product_supplier_links;
DROP POLICY IF EXISTS "owner insert product supplier links" ON public.product_supplier_links;
DROP POLICY IF EXISTS "owner update product supplier links" ON public.product_supplier_links;
DROP POLICY IF EXISTS "owner delete product supplier links" ON public.product_supplier_links;
CREATE POLICY "owner read product supplier links" ON public.product_supplier_links FOR SELECT TO authenticated USING(private.sama_is_owner());
CREATE POLICY "owner insert product supplier links" ON public.product_supplier_links FOR INSERT TO authenticated WITH CHECK(private.sama_is_owner());
CREATE POLICY "owner update product supplier links" ON public.product_supplier_links FOR UPDATE TO authenticated USING(private.sama_is_owner()) WITH CHECK(private.sama_is_owner());
CREATE POLICY "owner delete product supplier links" ON public.product_supplier_links FOR DELETE TO authenticated USING(private.sama_is_owner());

DROP POLICY IF EXISTS "admin manage suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "owner manage suppliers" ON public.suppliers;
CREATE POLICY "owner manage suppliers" ON public.suppliers FOR ALL TO authenticated USING(private.sama_is_owner()) WITH CHECK(private.sama_is_owner());

DROP POLICY IF EXISTS "admin manage stock" ON public.stock;
DROP POLICY IF EXISTS "admin read stock quantities" ON public.stock;
DROP POLICY IF EXISTS "admin insert stock quantities" ON public.stock;
DROP POLICY IF EXISTS "admin update stock quantities" ON public.stock;
DROP POLICY IF EXISTS "owner delete stock" ON public.stock;
CREATE POLICY "admin read stock quantities" ON public.stock FOR SELECT TO authenticated USING(private.sama_is_owner() OR private.sama_has_admin_permission('stock.view'));
CREATE POLICY "admin insert stock quantities" ON public.stock FOR INSERT TO authenticated WITH CHECK(private.sama_is_owner() OR private.sama_has_admin_permission('stock.update'));
CREATE POLICY "admin update stock quantities" ON public.stock FOR UPDATE TO authenticated USING(private.sama_is_owner() OR private.sama_has_admin_permission('stock.update')) WITH CHECK(private.sama_is_owner() OR private.sama_has_admin_permission('stock.update'));
CREATE POLICY "owner delete stock" ON public.stock FOR DELETE TO authenticated USING(private.sama_is_owner());
REVOKE SELECT,INSERT,UPDATE,DELETE ON public.stock FROM anon,authenticated;
GRANT SELECT(product_id,quantity,min_quantity,supplier,updated_at) ON public.stock TO authenticated;
GRANT INSERT(product_id,quantity,min_quantity,supplier) ON public.stock TO authenticated;
GRANT UPDATE(quantity,min_quantity,supplier,updated_at) ON public.stock TO authenticated;
CREATE OR REPLACE FUNCTION private.sama_guard_stock_cost()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$ BEGIN
 IF coalesce(current_setting('request.jwt.claim.role',true),'') IN ('service_role','supabase_admin','postgres') OR private.sama_is_owner() THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.unit_cost IS DISTINCT FROM OLD.unit_cost THEN RAISE EXCEPTION 'Seul le propriétaire peut modifier le coût unitaire du stock.'; END IF;
 IF TG_OP='INSERT' AND NEW.unit_cost IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Seul le propriétaire peut définir un coût unitaire.'; END IF;
 RETURN NEW;
END; $f$;
DROP TRIGGER IF EXISTS sama_guard_stock_cost ON public.stock;
CREATE TRIGGER sama_guard_stock_cost BEFORE INSERT OR UPDATE ON public.stock FOR EACH ROW EXECUTE FUNCTION private.sama_guard_stock_cost();

DROP POLICY IF EXISTS "admin manage quotes" ON public.quotes;
DROP POLICY IF EXISTS "customers read own b2b quotes or admin" ON public.quotes;
DROP POLICY IF EXISTS "customer owner or assigned admin read quotes" ON public.quotes;
DROP POLICY IF EXISTS "admin insert quotes" ON public.quotes;
DROP POLICY IF EXISTS "owner or assigned admin update quotes" ON public.quotes;
DROP POLICY IF EXISTS "owner delete quotes" ON public.quotes;
CREATE POLICY "customer owner or assigned admin read quotes" ON public.quotes FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()) OR private.sama_is_owner() OR (private.sama_has_admin_permission('quotes.view') AND coalesce(assigned_admin_id,sales_referrer_user_id)=(SELECT auth.uid())));
CREATE POLICY "admin insert quotes" ON public.quotes FOR INSERT TO authenticated WITH CHECK(private.sama_is_owner() OR (private.sama_has_admin_permission('quotes.view') AND (assigned_admin_id=(SELECT auth.uid()) OR sales_referrer_user_id=(SELECT auth.uid()))));
CREATE POLICY "owner or assigned admin update quotes" ON public.quotes FOR UPDATE TO authenticated USING(private.sama_is_owner() OR (private.sama_has_admin_permission('quotes.update_status') AND coalesce(assigned_admin_id,sales_referrer_user_id)=(SELECT auth.uid()))) WITH CHECK(private.sama_is_owner() OR (private.sama_has_admin_permission('quotes.update_status') AND coalesce(assigned_admin_id,sales_referrer_user_id)=(SELECT auth.uid())));
CREATE POLICY "owner delete quotes" ON public.quotes FOR DELETE TO authenticated USING(private.sama_is_owner());
CREATE OR REPLACE FUNCTION private.sama_guard_quote_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$ BEGIN
 IF coalesce(current_setting('request.jwt.claim.role',true),'') IN ('service_role','supabase_admin','postgres') OR private.sama_is_owner() THEN RETURN NEW; END IF;
 IF NEW.assigned_admin_id IS DISTINCT FROM OLD.assigned_admin_id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.business_account_id IS DISTINCT FROM OLD.business_account_id
 OR NEW.sales_referrer_user_id IS DISTINCT FROM OLD.sales_referrer_user_id OR NEW.sales_referral_code IS DISTINCT FROM OLD.sales_referral_code
 OR NEW.company IS DISTINCT FROM OLD.company OR NEW.phone IS DISTINCT FROM OLD.phone OR NEW.email IS DISTINCT FROM OLD.email
 OR NEW.need IS DISTINCT FROM OLD.need OR NEW.message IS DISTINCT FROM OLD.message OR NEW.created_at IS DISTINCT FROM OLD.created_at
 THEN RAISE EXCEPTION 'Un associé peut uniquement mettre à jour le statut de son devis attribué.'; END IF;
 RETURN NEW;
END; $f$;
DROP TRIGGER IF EXISTS sama_guard_quote_update ON public.quotes;
CREATE TRIGGER sama_guard_quote_update BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION private.sama_guard_quote_update();
CREATE OR REPLACE FUNCTION private.sama_assign_quote_to_sales_rep()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$ BEGIN
 IF NEW.assigned_admin_id IS NULL AND NEW.sales_referrer_user_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=NEW.sales_referrer_user_id AND p.role='admin' AND p.is_super_admin IS FALSE) THEN NEW.assigned_admin_id:=NEW.sales_referrer_user_id; END IF;
 RETURN NEW;
END; $f$;
DROP TRIGGER IF EXISTS sama_assign_quote_to_sales_rep ON public.quotes;
CREATE TRIGGER sama_assign_quote_to_sales_rep BEFORE INSERT OR UPDATE OF sales_referrer_user_id ON public.quotes FOR EACH ROW EXECUTE FUNCTION private.sama_assign_quote_to_sales_rep();

DROP POLICY IF EXISTS "admin manage expenses" ON public.expenses;
DROP POLICY IF EXISTS "owner or submitter read expenses" ON public.expenses;
DROP POLICY IF EXISTS "owner or associate submit expense" ON public.expenses;
DROP POLICY IF EXISTS "owner update expenses" ON public.expenses;
DROP POLICY IF EXISTS "owner delete expenses" ON public.expenses;
CREATE POLICY "owner or submitter read expenses" ON public.expenses FOR SELECT TO authenticated USING(private.sama_is_owner() OR (private.sama_has_admin_permission('expenses.submit') AND submitted_by=(SELECT auth.uid())));
CREATE POLICY "owner or associate submit expense" ON public.expenses FOR INSERT TO authenticated WITH CHECK(private.sama_is_owner() OR (private.sama_has_admin_permission('expenses.submit') AND submitted_by=(SELECT auth.uid()) AND approval_status='pending' AND approved_by IS NULL AND approved_at IS NULL));
CREATE POLICY "owner update expenses" ON public.expenses FOR UPDATE TO authenticated USING(private.sama_is_owner()) WITH CHECK(private.sama_is_owner());
CREATE POLICY "owner delete expenses" ON public.expenses FOR DELETE TO authenticated USING(private.sama_is_owner());

DROP POLICY IF EXISTS "sales codes owner or admin read" ON public.sales_referral_codes;
DROP POLICY IF EXISTS "sales codes admin delete" ON public.sales_referral_codes;
DROP POLICY IF EXISTS "sales codes admin insert" ON public.sales_referral_codes;
DROP POLICY IF EXISTS "sales codes admin update" ON public.sales_referral_codes;
DROP POLICY IF EXISTS "owner or own admin read sales codes" ON public.sales_referral_codes;
DROP POLICY IF EXISTS "owner or own admin insert sales codes" ON public.sales_referral_codes;
DROP POLICY IF EXISTS "owner or own admin update sales codes" ON public.sales_referral_codes;
DROP POLICY IF EXISTS "owner delete sales codes" ON public.sales_referral_codes;
CREATE POLICY "owner or own admin read sales codes" ON public.sales_referral_codes FOR SELECT TO authenticated USING(private.sama_is_owner() OR owner_user_id=(SELECT auth.uid()));
CREATE POLICY "owner or own admin insert sales codes" ON public.sales_referral_codes FOR INSERT TO authenticated WITH CHECK(private.sama_is_owner() OR (private.sama_has_admin_permission('sales_codes.manage_own') AND owner_user_id=(SELECT auth.uid()) AND (created_by IS NULL OR created_by=(SELECT auth.uid()))));
CREATE POLICY "owner or own admin update sales codes" ON public.sales_referral_codes FOR UPDATE TO authenticated USING(private.sama_is_owner() OR (private.sama_has_admin_permission('sales_codes.manage_own') AND owner_user_id=(SELECT auth.uid()))) WITH CHECK(private.sama_is_owner() OR (private.sama_has_admin_permission('sales_codes.manage_own') AND owner_user_id=(SELECT auth.uid())));
CREATE POLICY "owner delete sales codes" ON public.sales_referral_codes FOR DELETE TO authenticated USING(private.sama_is_owner());

DROP POLICY IF EXISTS "Admins read customer notifications" ON public.notifications;
DROP POLICY IF EXISTS "owner or associated order admin read notifications" ON public.notifications;
DROP POLICY IF EXISTS "owner recipient or assigned admin read notifications" ON public.notifications;
CREATE POLICY "owner recipient or assigned admin read notifications" ON public.notifications FOR SELECT TO authenticated USING(private.sama_is_owner() OR recipient_user_id=(SELECT auth.uid()) OR (private.sama_has_admin_permission('orders.view') AND entity_type='order' AND EXISTS(SELECT 1 FROM public.orders o WHERE o.id=notifications.entity_id AND coalesce(o.assigned_admin_id,o.sales_referrer_user_id)=(SELECT auth.uid()))));

DROP POLICY IF EXISTS "Admins read customer email campaigns" ON public.customer_email_campaigns;
DROP POLICY IF EXISTS "owner read customer email campaigns" ON public.customer_email_campaigns;
CREATE POLICY "owner read customer email campaigns" ON public.customer_email_campaigns FOR SELECT TO authenticated USING(private.sama_is_owner());
DROP POLICY IF EXISTS "customer email recipient owner read" ON public.customer_email_campaign_recipients;
DROP POLICY IF EXISTS "owner read customer email campaign recipients" ON public.customer_email_campaign_recipients;
CREATE POLICY "owner read customer email campaign recipients" ON public.customer_email_campaign_recipients FOR SELECT TO authenticated USING(private.sama_is_owner());
REVOKE ALL ON public.customer_email_campaign_recipients FROM anon,authenticated;
GRANT SELECT ON public.customer_email_campaign_recipients TO authenticated;

DROP POLICY IF EXISTS "audit logs admin read" ON public.audit_logs;
DROP POLICY IF EXISTS "owner read audit logs" ON public.audit_logs;
CREATE POLICY "owner read audit logs" ON public.audit_logs FOR SELECT TO authenticated USING(private.sama_is_owner());
DROP POLICY IF EXISTS "admin read activity" ON public.activity;
DROP POLICY IF EXISTS "owner read activity" ON public.activity;
CREATE POLICY "owner read activity" ON public.activity FOR SELECT TO authenticated USING(private.sama_is_owner());

DROP POLICY IF EXISTS "subscriptions read own or admin" ON public.replenishment_subscriptions;
DROP POLICY IF EXISTS "subscriptions update own or admin" ON public.replenishment_subscriptions;
DROP POLICY IF EXISTS "subscriptions delete own or admin" ON public.replenishment_subscriptions;
DROP POLICY IF EXISTS "subscriptions read own or owner" ON public.replenishment_subscriptions;
DROP POLICY IF EXISTS "subscriptions update own or owner" ON public.replenishment_subscriptions;
DROP POLICY IF EXISTS "subscriptions delete own or owner" ON public.replenishment_subscriptions;
CREATE POLICY "subscriptions read own or owner" ON public.replenishment_subscriptions FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()) OR private.sama_is_owner());
CREATE POLICY "subscriptions update own or owner" ON public.replenishment_subscriptions FOR UPDATE TO authenticated USING(user_id=(SELECT auth.uid()) OR private.sama_is_owner()) WITH CHECK(user_id=(SELECT auth.uid()) OR private.sama_is_owner());
CREATE POLICY "subscriptions delete own or owner" ON public.replenishment_subscriptions FOR DELETE TO authenticated USING(user_id=(SELECT auth.uid()) OR private.sama_is_owner());

REVOKE SELECT,UPDATE ON public.settings FROM anon,authenticated;
GRANT SELECT(company,whatsapp,delivery_fee,currency,updated_at,homepage_background_url) ON public.settings TO anon,authenticated;
GRANT SELECT(id,company,whatsapp,delivery_fee,currency,updated_at,homepage_background_url,payment_fee_percent) ON public.settings TO authenticated;
GRANT UPDATE(company,whatsapp,delivery_fee,currency,updated_at,homepage_background_url,payment_fee_percent) ON public.settings TO authenticated;
DROP POLICY IF EXISTS "admin update settings" ON public.settings;
DROP POLICY IF EXISTS "owner update settings" ON public.settings;
CREATE POLICY "owner update settings" ON public.settings FOR UPDATE TO authenticated USING(private.sama_is_owner()) WITH CHECK(private.sama_is_owner());

DROP POLICY IF EXISTS "notification_settings_admin_select" ON public.notification_settings;
DROP POLICY IF EXISTS "notification_settings_admin_update" ON public.notification_settings;
DROP POLICY IF EXISTS "owner read notification settings" ON public.notification_settings;
DROP POLICY IF EXISTS "owner update notification settings" ON public.notification_settings;
CREATE POLICY "owner read notification settings" ON public.notification_settings FOR SELECT TO authenticated USING(private.sama_is_owner());
CREATE POLICY "owner update notification settings" ON public.notification_settings FOR UPDATE TO authenticated USING(private.sama_is_owner()) WITH CHECK(private.sama_is_owner());
GRANT SELECT,UPDATE ON public.notification_settings TO authenticated;

REVOKE ALL ON public.order_profitability FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.sama_get_order_profitability()
RETURNS TABLE(order_id text,created_at timestamptz,status text,customer_name text,customer_phone text,business_account_id uuid,sales_referral_code text,sales_referrer_user_id uuid,subtotal numeric,delivery numeric,revenue numeric,product_cost numeric,estimated_payment_fee numeric,delivery_cost_actual numeric,estimated_contribution_margin numeric,cost_data_complete boolean,item_line_count integer,payment_fee_percent numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$ BEGIN
 IF NOT private.sama_is_owner() THEN RAISE EXCEPTION 'La rentabilité est réservée au propriétaire de SAMA-PACK.'; END IF;
 RETURN QUERY SELECT v.order_id,v.created_at,v.status,v.customer_name,v.customer_phone,v.business_account_id,v.sales_referral_code,v.sales_referrer_user_id,v.subtotal,v.delivery,v.revenue,v.product_cost,v.estimated_payment_fee,v.delivery_cost_actual,v.estimated_contribution_margin,v.cost_data_complete,v.item_line_count,v.payment_fee_percent FROM public.order_profitability v ORDER BY v.created_at DESC LIMIT 250;
END; $f$;
REVOKE ALL ON FUNCTION public.sama_get_order_profitability() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sama_get_order_profitability() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.sama_admin_add_expense(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sama_admin_add_supplier(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sama_admin_check(uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sama_admin_customers(uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sama_admin_dashboard(uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sama_admin_expenses(uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sama_admin_login(text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sama_admin_orders(uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sama_admin_quotes(uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sama_admin_set_order_status(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sama_admin_set_quote_status(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sama_admin_settings(uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sama_admin_stock(uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sama_admin_suppliers(uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sama_admin_update_product(uuid,text,numeric,boolean) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sama_admin_update_settings(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sama_admin_update_stock(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sama_bootstrap_first_admin(text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sama_dispatch_order_email() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sama_dispatch_quote_email() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sama_enforce_payment_before_fulfillment() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sama_notify_due_replenishment_reminders() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sama_notify_order_ready_after_payment() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sama_mark_notification_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sama_mark_notification_read(uuid) TO authenticated;

DROP POLICY IF EXISTS "Sama-Pack admins delete product images" ON storage.objects;
DROP POLICY IF EXISTS "Sama-Pack admins update product images" ON storage.objects;
DROP POLICY IF EXISTS "Sama-Pack admins upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Sama-Pack admins view product image objects" ON storage.objects;
DROP POLICY IF EXISTS "SAMA-PACK owner delete product images" ON storage.objects;
DROP POLICY IF EXISTS "SAMA-PACK owner update product images" ON storage.objects;
DROP POLICY IF EXISTS "SAMA-PACK owner upload product images" ON storage.objects;
DROP POLICY IF EXISTS "SAMA-PACK owner view product image objects" ON storage.objects;
CREATE POLICY "SAMA-PACK owner delete product images" ON storage.objects FOR DELETE TO authenticated USING(bucket_id='sama-pack-products' AND private.sama_is_owner());
CREATE POLICY "SAMA-PACK owner update product images" ON storage.objects FOR UPDATE TO authenticated USING(bucket_id='sama-pack-products' AND private.sama_is_owner()) WITH CHECK(bucket_id='sama-pack-products' AND private.sama_is_owner());
CREATE POLICY "SAMA-PACK owner upload product images" ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='sama-pack-products' AND private.sama_is_owner());
CREATE POLICY "SAMA-PACK owner view product image objects" ON storage.objects FOR SELECT TO authenticated USING(bucket_id='sama-pack-products' AND private.sama_is_owner());
