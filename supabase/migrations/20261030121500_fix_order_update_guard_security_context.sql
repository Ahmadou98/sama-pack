CREATE OR REPLACE FUNCTION private.sama_guard_order_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- current_user vaut le propriétaire de cette fonction SECURITY DEFINER.
  -- session_user conserve le rôle de connexion d'origine (postgres pour les
  -- opérations SQL de maintenance, authenticator pour les appels Data API).
  IF coalesce(current_setting('request.jwt.claim.role',true),'') IN ('service_role','supabase_admin','postgres')
     OR session_user IN ('postgres','supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'out_for_delivery'
     AND OLD.delivery_attempt_status IN ('in_progress','failed')
     AND NEW.status = 'cancelled' THEN
    RAISE EXCEPTION 'Une commande confiée au livreur doit passer par la procédure sécurisée de retour au dépôt avant son annulation.';
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
