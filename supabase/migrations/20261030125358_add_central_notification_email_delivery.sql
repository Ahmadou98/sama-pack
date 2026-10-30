
CREATE TABLE IF NOT EXISTS private.notification_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  recipient_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  recipient_role text NOT NULL DEFAULT 'unknown',
  notification_type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  entity_type text NOT NULL DEFAULT '',
  entity_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_email_outbox_notification_recipient_key
    UNIQUE (notification_id, recipient_email)
);

CREATE INDEX IF NOT EXISTS notification_email_outbox_ready_idx
  ON private.notification_email_outbox (status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS notification_email_outbox_sent_at_idx
  ON private.notification_email_outbox (sent_at) WHERE status = 'sent';
REVOKE ALL ON TABLE private.notification_email_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE private.notification_email_outbox TO service_role;

CREATE OR REPLACE FUNCTION private.enqueue_notification_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO private.notification_email_outbox (
    notification_id, recipient_user_id, recipient_email, recipient_role,
    notification_type, title, message, entity_type, entity_id, status, last_error
  )
  SELECT
    NEW.id, p.id, lower(btrim(p.email)), coalesce(p.role, 'unknown'),
    NEW.type, NEW.title, coalesce(NEW.message, ''),
    coalesce(NEW.entity_type, ''), coalesce(NEW.entity_id, ''),
    CASE
      WHEN btrim(coalesce(p.email, '')) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        THEN 'pending'
      ELSE 'skipped'
    END,
    CASE
      WHEN btrim(coalesce(p.email, '')) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        THEN ''
      ELSE 'Adresse e-mail absente ou invalide dans le profil.'
    END
  FROM public.profiles p
  WHERE p.id = NEW.recipient_user_id
  ON CONFLICT (notification_id, recipient_email) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER notifications_enqueue_email
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION private.enqueue_notification_email();

CREATE OR REPLACE FUNCTION public.sama_validate_notification_email_worker_token(p_token text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT coalesce(
    p_token IS NOT NULL AND p_token <> '' AND p_token = (
      SELECT s.decrypted_secret
      FROM vault.decrypted_secrets s
      WHERE s.name = 'sama_notification_email_worker_token'
      LIMIT 1
    ), false
  );
$function$;

CREATE OR REPLACE FUNCTION public.sama_claim_notification_email_batch(p_limit integer DEFAULT 5)
RETURNS TABLE (
  id uuid, notification_id uuid, recipient_email text, recipient_role text,
  notification_type text, title text, message text, entity_type text,
  entity_id text, attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_sent_today integer := 0;
  v_remaining integer := 0;
  v_day_start timestamptz;
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required';
  END IF;
  v_day_start := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  SELECT count(*)::integer INTO v_sent_today
  FROM private.notification_email_outbox q
  WHERE q.status = 'sent' AND q.sent_at >= v_day_start;
  v_remaining := greatest(0, 80 - v_sent_today);
  IF v_remaining <= 0 THEN RETURN; END IF;

  UPDATE private.notification_email_outbox q
     SET status = 'failed', locked_at = NULL,
         last_error = 'Nombre maximal de tentatives atteint après interruption du traitement.',
         updated_at = now()
   WHERE q.status = 'processing'
     AND q.locked_at < now() - interval '30 minutes'
     AND q.attempt_count >= 6;

  RETURN QUERY
  WITH candidates AS (
    SELECT q.id
    FROM private.notification_email_outbox q
    WHERE (
      (q.status IN ('pending', 'failed') AND q.next_attempt_at <= now() AND q.attempt_count < 6)
      OR
      (q.status = 'processing' AND q.locked_at < now() - interval '15 minutes' AND q.attempt_count < 6)
    )
    ORDER BY q.created_at, q.id
    FOR UPDATE SKIP LOCKED
    LIMIT least(5, greatest(1, coalesce(p_limit, 5)), v_remaining)
  ),
  claimed AS (
    UPDATE private.notification_email_outbox q
       SET status = 'processing', attempt_count = q.attempt_count + 1,
           locked_at = now(), updated_at = now()
     WHERE q.id IN (SELECT c.id FROM candidates c)
    RETURNING q.id, q.notification_id, q.recipient_email, q.recipient_role,
              q.notification_type, q.title, q.message, q.entity_type,
              q.entity_id, q.attempt_count
  )
  SELECT c.id, c.notification_id, c.recipient_email, c.recipient_role,
         c.notification_type, c.title, c.message, c.entity_type,
         c.entity_id, c.attempt_count
  FROM claimed c;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sama_finish_notification_email_job(
  p_outbox_id uuid, p_status text, p_provider_message_id text DEFAULT NULL, p_error text DEFAULT ''
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_changed integer;
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required';
  END IF;
  IF p_status NOT IN ('sent', 'failed') THEN RAISE EXCEPTION 'invalid email job status'; END IF;
  UPDATE private.notification_email_outbox q
     SET status = p_status,
         provider_message_id = CASE WHEN p_status = 'sent' THEN nullif(p_provider_message_id, '') ELSE q.provider_message_id END,
         last_error = CASE WHEN p_status = 'failed' THEN left(coalesce(p_error, ''), 1000) ELSE '' END,
         sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE q.sent_at END,
         next_attempt_at = CASE WHEN p_status = 'failed'
           THEN now() + make_interval(secs => least(3600, (60 * power(2::numeric, greatest(0, q.attempt_count - 1)))::integer))
           ELSE q.next_attempt_at END,
         locked_at = NULL, updated_at = now()
   WHERE q.id = p_outbox_id AND q.status = 'processing';
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN v_changed = 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.sama_validate_notification_email_worker_token(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sama_claim_notification_email_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sama_finish_notification_email_job(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sama_validate_notification_email_worker_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sama_claim_notification_email_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.sama_finish_notification_email_job(uuid, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.sama_dispatch_order_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$ BEGIN RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.sama_dispatch_quote_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$ BEGIN RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION private.enqueue_notification_sms()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$ BEGIN RETURN NEW; END; $function$;

DO $block$
DECLARE v_sms_job_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'sama_notification_email_worker_token') THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'sama_notification_email_worker_token',
      'Jeton privé pour le traitement des notifications e-mail SAMA-PACK'
    );
  END IF;
  SELECT j.jobid INTO v_sms_job_id
  FROM cron.job j WHERE j.jobname = 'sama-send-notification-sms' LIMIT 1;
  IF v_sms_job_id IS NOT NULL THEN
    PERFORM cron.alter_job(job_id := v_sms_job_id, active := false);
  END IF;
END;
$block$;

SELECT cron.schedule(
  'sama-send-notification-email',
  '* * * * *',
  $job$
    SELECT net.http_post(
      url := 'https://tbxxrnhcfuaeaatlrdtr.supabase.co/functions/v1/sama-send-notification-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-email-cron-token', (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'sama_notification_email_worker_token' LIMIT 1
        )
      ),
      body := jsonb_build_object('source', 'scheduled'),
      timeout_milliseconds := 15000
    );
  $job$
);
