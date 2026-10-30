
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

REVOKE ALL ON FUNCTION public.sama_claim_notification_email_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sama_finish_notification_email_job(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sama_claim_notification_email_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.sama_finish_notification_email_job(uuid, text, text, text) TO service_role;
