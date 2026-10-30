CREATE OR REPLACE FUNCTION private.sama_guard_order_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role',true),'') IN ('service_role','supabase_admin','postgres')
     OR current_user IN ('postgres','supabase_admin') THEN
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

CREATE OR REPLACE FUNCTION public.sama_notify_customer_order_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_title text;
  v_message text;
  v_balance numeric;
  v_slot text;
BEGIN
  IF new.user_id IS NULL OR old.status IS NOT DISTINCT FROM new.status THEN
    RETURN new;
  END IF;
  IF new.status = 'new' AND old.status IN ('awaiting_payment','awaiting_delivery_payment') THEN
    RETURN new;
  END IF;

  v_balance := greatest(0, coalesce(new.total,0) - coalesce(new.amount_paid,0));
  v_slot := nullif(btrim(coalesce(new.slot,'')),'');
  v_title := CASE new.status
    WHEN 'new' THEN 'Commande reçue'
    WHEN 'confirmed' THEN 'Commande confirmée'
    WHEN 'processing' THEN 'Préparation en cours'
    WHEN 'prepared' THEN 'Commande préparée'
    WHEN 'out_for_delivery' THEN 'Commande en cours de livraison'
    WHEN 'delivered' THEN 'Commande livrée'
    WHEN 'cancelled' THEN 'Commande annulée'
    ELSE 'Mise à jour de commande'
  END;

  v_message := CASE
    WHEN new.status = 'new' THEN 'Nous avons bien reçu ta commande ' || new.id || '.'
    WHEN new.status = 'confirmed' THEN 'Ta commande ' || new.id || ' est confirmée.'
    WHEN new.status = 'processing' THEN 'Nous préparons actuellement ta commande ' || new.id || '.'
    WHEN new.status = 'prepared' THEN 'Ta commande ' || new.id || ' est prête pour la livraison.'
    WHEN new.status = 'out_for_delivery' THEN 'Ta commande ' || new.id || ' est en cours de livraison.'
    WHEN new.status = 'delivered' AND coalesce(new.amount_paid,0) + 0.01 >= coalesce(new.total,0)
      THEN 'Ta commande ' || new.id || ' a été livrée. Le montant total a été encaissé et validé intégralement par SAMA-PACK. Merci pour ta confiance.'
    WHEN new.status = 'delivered'
      THEN 'Ta commande ' || new.id || ' a été marquée comme livrée, mais le paiement intégral n’est pas encore validé. Le montant indiqué ci-dessous correspond uniquement aux sommes confirmées par SAMA-PACK.'
    WHEN new.status = 'cancelled' AND old.status = 'out_for_delivery'
         AND old.delivery_attempt_status IN ('in_progress','failed')
      THEN 'Ta commande ' || new.id || ' a été annulée pendant sa livraison. Le colis doit être rapporté et contrôlé chez SAMA-PACK. Notre équipe te communiquera les prochaines étapes.'
    WHEN new.status = 'cancelled'
      THEN 'Ta commande ' || new.id || ' a été annulée. Contacte SAMA-PACK si tu as une question.'
    ELSE 'Le statut de ta commande ' || new.id || ' a changé.'
  END
  || ' Montant total : ' || to_char(coalesce(new.total,0), 'FM999G999G990') || ' FCFA.'
  || ' Encaissé et validé : ' || to_char(coalesce(new.amount_paid,0), 'FM999G999G990') || ' FCFA.'
  || ' Solde restant : ' || to_char(v_balance, 'FM999G999G990') || ' FCFA.'
  || CASE WHEN v_slot IS NOT NULL THEN ' Créneau prévu : ' || v_slot || '.' ELSE '' END;

  INSERT INTO public.notifications(recipient_user_id, type, title, message, entity_type, entity_id)
  VALUES(new.user_id, 'order_status', v_title, v_message, 'order', new.id);

  RETURN new;
END;
$function$;
