ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY['customer'::text, 'admin'::text, 'courier'::text]));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS assigned_courier_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_attempt_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS delivery_failure_reason text NOT NULL DEFAULT '';
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_delivery_attempt_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_delivery_attempt_status_check
  CHECK (delivery_attempt_status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'failed'::text, 'delivered'::text]));

CREATE INDEX IF NOT EXISTS orders_assigned_courier_status_idx
  ON public.orders (assigned_courier_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.delivery_confirmation_codes (
  order_id text PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  salt text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  verified_at timestamptz
);
ALTER TABLE public.delivery_confirmation_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_confirmation_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.delivery_confirmation_codes TO service_role;

CREATE TABLE IF NOT EXISTS public.order_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  courier_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type = ANY (ARRAY['assigned'::text, 'assignment_removed'::text, 'out_for_delivery'::text, 'delivery_confirmed'::text, 'delivery_failed'::text, 'collection_recorded'::text, 'collection_validated'::text, 'collection_rejected'::text])),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 1000),
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  payment_method text NOT NULL DEFAULT '',
  review_status text NOT NULL DEFAULT 'not_applicable' CHECK (review_status = ANY (ARRAY['not_applicable'::text, 'pending'::text, 'validated'::text, 'rejected'::text])),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_delivery_events_order_created_idx
  ON public.order_delivery_events (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_delivery_events_pending_idx
  ON public.order_delivery_events (review_status, created_at DESC)
  WHERE event_type = 'collection_recorded' AND review_status = 'pending';
ALTER TABLE public.order_delivery_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_delivery_events FROM PUBLIC, anon;
GRANT SELECT ON public.order_delivery_events TO authenticated;
DROP POLICY IF EXISTS "Admins and assigned couriers can read delivery events" ON public.order_delivery_events;
CREATE POLICY "Admins and assigned couriers can read delivery events"
ON public.order_delivery_events FOR SELECT TO authenticated
USING (
  courier_id = (SELECT auth.uid())
  OR private.sama_is_owner()
  OR private.sama_can_view_order(order_id, 'orders.view')
);

DROP POLICY IF EXISTS "Assigned couriers can read their deliveries" ON public.orders;
CREATE POLICY "Assigned couriers can read their deliveries"
ON public.orders FOR SELECT TO authenticated
USING (
  assigned_courier_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.role = 'courier'
  )
);

CREATE OR REPLACE FUNCTION private.sama_guard_order_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role',true),'') IN ('service_role','supabase_admin','postgres')
     OR current_user IN ('postgres','supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF private.sama_is_owner() THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status NOT IN ('new','confirmed','processing','prepared','out_for_delivery','delivered','cancelled','awaiting_payment','awaiting_delivery_payment') THEN
    RAISE EXCEPTION 'Statut de commande invalide.';
  END IF;

  IF NEW.assigned_courier_id IS DISTINCT FROM OLD.assigned_courier_id
    OR NEW.delivery_attempt_status IS DISTINCT FROM OLD.delivery_attempt_status
    OR NEW.delivery_failure_reason IS DISTINCT FROM OLD.delivery_failure_reason
    OR NEW.assigned_admin_id IS DISTINCT FROM OLD.assigned_admin_id
    OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.sales_referrer_user_id IS DISTINCT FROM OLD.sales_referrer_user_id
    OR NEW.sales_referral_code IS DISTINCT FROM OLD.sales_referral_code
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.delivery IS DISTINCT FROM OLD.delivery
    OR NEW.total IS DISTINCT FROM OLD.total
    OR NEW.amount_paid IS DISTINCT FROM OLD.amount_paid
    OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
    OR NEW.payment_choice IS DISTINCT FROM OLD.payment_choice
    OR NEW.payment IS DISTINCT FROM OLD.payment
    OR NEW.delivery_cost_actual IS DISTINCT FROM OLD.delivery_cost_actual
    OR NEW.payment_fee_percent IS DISTINCT FROM OLD.payment_fee_percent
    OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
    OR NEW.customer_phone IS DISTINCT FROM OLD.customer_phone
    OR NEW.delivery_address IS DISTINCT FROM OLD.delivery_address
    OR NEW.delivery_zone IS DISTINCT FROM OLD.delivery_zone
    OR NEW.slot IS DISTINCT FROM OLD.slot
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Un associé peut uniquement mettre à jour le statut de sa commande attribuée.';
  END IF;
  RETURN NEW;
END;
$function$;
