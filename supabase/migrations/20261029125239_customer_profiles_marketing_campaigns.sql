ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS profiles_marketing_unsubscribe_token_uidx
  ON public.profiles(marketing_unsubscribe_token);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS promo_started_at timestamptz;

CREATE TABLE IF NOT EXISTS public.customer_email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_key text NOT NULL UNIQUE,
  campaign_type text NOT NULL CHECK (campaign_type IN ('promotion','monthly')),
  subject text NOT NULL,
  product_id text REFERENCES public.products(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing','sent','partial','failed','skipped')),
  recipients_total integer NOT NULL DEFAULT 0 CHECK (recipients_total >= 0),
  recipients_sent integer NOT NULL DEFAULT 0 CHECK (recipients_sent >= 0),
  recipients_failed integer NOT NULL DEFAULT 0 CHECK (recipients_failed >= 0),
  error_message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.customer_email_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.customer_email_campaigns(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed','skipped')),
  provider_message_id text,
  error_message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (campaign_id, email)
);

CREATE INDEX IF NOT EXISTS customer_email_campaigns_created_at_idx
  ON public.customer_email_campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS customer_email_campaign_recipients_campaign_status_idx
  ON public.customer_email_campaign_recipients(campaign_id, status);

ALTER TABLE public.customer_email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_email_campaign_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read customer email campaigns" ON public.customer_email_campaigns;
CREATE POLICY "Admins read customer email campaigns"
  ON public.customer_email_campaigns
  FOR SELECT
  TO authenticated
  USING ((SELECT public.sama_is_admin()));

GRANT SELECT ON public.customer_email_campaigns TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.customer_email_campaigns FROM anon, authenticated;
REVOKE ALL ON public.customer_email_campaign_recipients FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.sama_handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name text;
  v_phone text;
  v_secondary text;
  v_marketing_opt_in boolean;
BEGIN
  v_name := left(coalesce(nullif(trim(v_meta->>'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1), 'Client'), 120);
  v_phone := left(regexp_replace(coalesce(v_meta->>'phone', ''), '[^0-9]', '', 'g'), 30);
  v_secondary := left(regexp_replace(coalesce(v_meta->>'phone_secondary', ''), '[^0-9]', '', 'g'), 30);
  v_marketing_opt_in := lower(coalesce(v_meta->>'marketing_opt_in', 'false')) = 'true';

  IF v_meta->>'account_type' = 'customer' THEN
    IF length(v_phone) < 8 OR length(v_phone) > 15 OR left(v_phone, 1) = '0' THEN
      RAISE EXCEPTION 'Un numéro WhatsApp valide avec indicatif international est obligatoire.';
    END IF;
    IF length(v_name) < 2
      OR nullif(trim(v_meta->>'delivery_region'), '') IS NULL
      OR nullif(trim(v_meta->>'delivery_city'), '') IS NULL
      OR nullif(trim(v_meta->>'delivery_commune'), '') IS NULL
      OR nullif(trim(v_meta->>'delivery_neighborhood'), '') IS NULL
      OR nullif(trim(v_meta->>'delivery_address'), '') IS NULL THEN
      RAISE EXCEPTION 'Le profil client doit contenir une adresse de livraison complète.';
    END IF;
  END IF;

  INSERT INTO public.profiles(
    id, full_name, phone, phone_secondary, delivery_region, delivery_city,
    delivery_commune, delivery_neighborhood, delivery_address, delivery_landmark,
    delivery_instructions, email, role, marketing_opt_in
  )
  VALUES(
    new.id, v_name, v_phone, v_secondary,
    left(coalesce(v_meta->>'delivery_region', ''), 100),
    left(coalesce(v_meta->>'delivery_city', ''), 100),
    left(coalesce(v_meta->>'delivery_commune', ''), 100),
    left(coalesce(v_meta->>'delivery_neighborhood', ''), 120),
    left(coalesce(v_meta->>'delivery_address', ''), 300),
    left(coalesce(v_meta->>'delivery_landmark', ''), 200),
    left(coalesce(v_meta->>'delivery_instructions', ''), 500),
    coalesce(new.email, ''), 'customer', v_marketing_opt_in
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = CASE WHEN public.profiles.full_name = '' THEN excluded.full_name ELSE public.profiles.full_name END,
    phone = CASE WHEN public.profiles.phone = '' THEN excluded.phone ELSE public.profiles.phone END,
    phone_secondary = CASE WHEN public.profiles.phone_secondary = '' THEN excluded.phone_secondary ELSE public.profiles.phone_secondary END,
    delivery_region = CASE WHEN public.profiles.delivery_region = '' THEN excluded.delivery_region ELSE public.profiles.delivery_region END,
    delivery_city = CASE WHEN public.profiles.delivery_city = '' THEN excluded.delivery_city ELSE public.profiles.delivery_city END,
    delivery_commune = CASE WHEN public.profiles.delivery_commune = '' THEN excluded.delivery_commune ELSE public.profiles.delivery_commune END,
    delivery_neighborhood = CASE WHEN public.profiles.delivery_neighborhood = '' THEN excluded.delivery_neighborhood ELSE public.profiles.delivery_neighborhood END,
    delivery_address = CASE WHEN public.profiles.delivery_address = '' THEN excluded.delivery_address ELSE public.profiles.delivery_address END,
    delivery_landmark = CASE WHEN public.profiles.delivery_landmark = '' THEN excluded.delivery_landmark ELSE public.profiles.delivery_landmark END,
    delivery_instructions = CASE WHEN public.profiles.delivery_instructions = '' THEN excluded.delivery_instructions ELSE public.profiles.delivery_instructions END,
    email = excluded.email,
    updated_at = now();
  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION private.sama_marketing_http_dispatch(p_body jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_token text;
BEGIN
  SELECT ns.webhook_token INTO v_token
  FROM public.notification_settings ns
  WHERE ns.id IS TRUE;

  IF coalesce(v_token, '') = '' THEN
    RAISE WARNING 'SAMA-PACK marketing email token is not configured.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://tbxxrnhcfuaeaatlrdtr.supabase.co/functions/v1/sama-customer-marketing',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sama-internal-token', v_token),
    body := p_body,
    timeout_milliseconds := 10000
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.sama_prepare_product_promotion_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_promo_details_changed boolean := true;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_promo_details_changed :=
      OLD.active IS DISTINCT FROM NEW.active
      OR OLD.promo_active IS DISTINCT FROM NEW.promo_active
      OR OLD.promo_price IS DISTINCT FROM NEW.promo_price
      OR OLD.promo_label IS DISTINCT FROM NEW.promo_label
      OR OLD.promo_end_at IS DISTINCT FROM NEW.promo_end_at
      OR OLD.price IS DISTINCT FROM NEW.price;
  END IF;

  IF NEW.active IS TRUE
    AND NEW.promo_active IS TRUE
    AND NEW.promo_price IS NOT NULL
    AND NEW.promo_price >= 0
    AND NEW.promo_price < NEW.price
    AND (NEW.promo_end_at IS NULL OR NEW.promo_end_at > now()) THEN
    IF v_promo_details_changed THEN
      NEW.promo_started_at := clock_timestamp();
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.promo_started_at := OLD.promo_started_at;
    END IF;
  ELSE
    NEW.promo_started_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.sama_enqueue_product_promotion_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_event_key text;
BEGIN
  IF NEW.active IS NOT TRUE
    OR NEW.promo_active IS NOT TRUE
    OR NEW.promo_price IS NULL
    OR NEW.promo_price < 0
    OR NEW.promo_price >= NEW.price
    OR NEW.promo_started_at IS NULL
    OR (NEW.promo_end_at IS NOT NULL AND NEW.promo_end_at <= now()) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.promo_started_at IS NOT DISTINCT FROM NEW.promo_started_at THEN
    RETURN NEW;
  END IF;

  v_event_key := to_char(EXTRACT(EPOCH FROM NEW.promo_started_at), 'FM999999999999999999.000000');
  PERFORM private.sama_marketing_http_dispatch(jsonb_build_object(
    'action', 'promotion',
    'product_id', NEW.id,
    'event_key', v_event_key
  ));
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.sama_dispatch_monthly_customer_marketing()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  PERFORM private.sama_marketing_http_dispatch(jsonb_build_object('action', 'monthly'));
END;
$function$;

REVOKE ALL ON FUNCTION private.sama_marketing_http_dispatch(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sama_prepare_product_promotion_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sama_enqueue_product_promotion_email() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sama_dispatch_monthly_customer_marketing() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sama_products_prepare_promotion_event ON public.products;
CREATE TRIGGER sama_products_prepare_promotion_event
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION private.sama_prepare_product_promotion_event();

DROP TRIGGER IF EXISTS sama_products_enqueue_promotion_email ON public.products;
CREATE TRIGGER sama_products_enqueue_promotion_email
  AFTER INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION private.sama_enqueue_product_promotion_email();

DO $migration$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'sama-pack-monthly-customer-marketing'
  LIMIT 1;
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
  PERFORM cron.schedule(
    'sama-pack-monthly-customer-marketing',
    '0 8 1 * *',
    'select private.sama_dispatch_monthly_customer_marketing();'
  );
END;
$migration$;
