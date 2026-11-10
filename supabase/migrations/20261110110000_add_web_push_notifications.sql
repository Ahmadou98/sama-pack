CREATE TABLE IF NOT EXISTS private.web_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT web_push_endpoint_https CHECK (endpoint LIKE 'https://%'),
  CONSTRAINT web_push_p256dh_nonempty CHECK (length(p256dh) BETWEEN 32 AND 200),
  CONSTRAINT web_push_auth_nonempty CHECK (length(auth) BETWEEN 16 AND 100)
);
CREATE INDEX IF NOT EXISTS web_push_subscriptions_user_idx ON private.web_push_subscriptions(user_id);
REVOKE ALL ON TABLE private.web_push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.web_push_subscriptions TO service_role;

CREATE TABLE IF NOT EXISTS private.web_push_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT web_push_outbox_notification_user_key UNIQUE(notification_id, recipient_user_id)
);
CREATE INDEX IF NOT EXISTS web_push_outbox_ready_idx ON private.web_push_outbox(status,next_attempt_at,created_at);
REVOKE ALL ON TABLE private.web_push_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.web_push_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.sama_register_web_push(p_endpoint text,p_p256dh text,p_auth text,p_user_agent text DEFAULT '')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Connexion requise pour activer les notifications.'; END IF;
  IF p_endpoint IS NULL OR length(p_endpoint)>2048 OR p_endpoint NOT LIKE 'https://%' THEN RAISE EXCEPTION 'Adresse de notification invalide.'; END IF;
  IF p_p256dh IS NULL OR length(p_p256dh) NOT BETWEEN 32 AND 200 OR p_auth IS NULL OR length(p_auth) NOT BETWEEN 16 AND 100 THEN RAISE EXCEPTION 'Clés de notification invalides.'; END IF;
  DELETE FROM private.web_push_subscriptions WHERE endpoint=p_endpoint;
  INSERT INTO private.web_push_subscriptions(user_id,endpoint,p256dh,auth,user_agent,updated_at)
  VALUES(v_user_id,p_endpoint,p_p256dh,p_auth,left(coalesce(p_user_agent,''),500),now());
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sama_unregister_web_push(p_endpoint text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise.'; END IF;
  DELETE FROM private.web_push_subscriptions WHERE endpoint=p_endpoint AND user_id=auth.uid();
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION private.enqueue_notification_web_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO private.web_push_outbox(notification_id,recipient_user_id)
  SELECT NEW.id,NEW.recipient_user_id
  WHERE EXISTS(SELECT 1 FROM private.web_push_subscriptions s WHERE s.user_id=NEW.recipient_user_id)
  ON CONFLICT(notification_id,recipient_user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS notifications_enqueue_web_push ON public.notifications;
CREATE TRIGGER notifications_enqueue_web_push AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION private.enqueue_notification_web_push();

CREATE OR REPLACE FUNCTION public.sama_validate_web_push_worker_token(p_token text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT coalesce(p_token IS NOT NULL AND p_token<>'' AND p_token=(
    SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name='sama_web_push_worker_token' LIMIT 1
  ),false);
$function$;

CREATE OR REPLACE FUNCTION public.sama_get_web_push_private_key()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name='sama_web_push_vapid_private' LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.sama_claim_web_push_batch(p_limit integer DEFAULT 25)
RETURNS TABLE(outbox_id uuid,notification_id uuid,recipient_user_id uuid,attempt_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN RAISE EXCEPTION 'service_role required'; END IF;
  UPDATE private.web_push_outbox q SET status='failed',locked_at=NULL,last_error='Nombre maximal de tentatives atteint après interruption du traitement.',updated_at=now()
  WHERE q.status='processing' AND q.locked_at<now()-interval '15 minutes' AND q.attempt_count>=6;
  RETURN QUERY
  WITH candidates AS (
    SELECT q.id FROM private.web_push_outbox q
    WHERE ((q.status IN ('pending','failed') AND q.next_attempt_at<=now() AND q.attempt_count<6)
      OR (q.status='processing' AND q.locked_at<now()-interval '2 minutes' AND q.attempt_count<6))
    ORDER BY q.created_at,q.id FOR UPDATE SKIP LOCKED LIMIT least(50,greatest(1,coalesce(p_limit,25)))
  ), claimed AS (
    UPDATE private.web_push_outbox q SET status='processing',attempt_count=q.attempt_count+1,locked_at=now(),updated_at=now()
    WHERE q.id IN(SELECT c.id FROM candidates c)
    RETURNING q.id,q.notification_id,q.recipient_user_id,q.attempt_count
  )
  SELECT c.id,c.notification_id,c.recipient_user_id,c.attempt_count FROM claimed c;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sama_get_web_push_job(p_outbox_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_job jsonb;
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN RAISE EXCEPTION 'service_role required'; END IF;
  SELECT jsonb_build_object('notification_id',n.id,'recipient_user_id',q.recipient_user_id,'title',n.title,'message',n.message,
    'entity_type',n.entity_type,'entity_id',n.entity_id,
    'subscriptions',coalesce((SELECT jsonb_agg(jsonb_build_object('endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth))
      FROM private.web_push_subscriptions s WHERE s.user_id=q.recipient_user_id),'[]'::jsonb))
  INTO v_job FROM private.web_push_outbox q JOIN public.notifications n ON n.id=q.notification_id WHERE q.id=p_outbox_id;
  RETURN v_job;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sama_delete_web_push_subscription(p_endpoint text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN RAISE EXCEPTION 'service_role required'; END IF;
  DELETE FROM private.web_push_subscriptions WHERE endpoint=p_endpoint;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sama_finish_web_push_job(p_outbox_id uuid,p_status text,p_error text DEFAULT '')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_changed integer;
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN RAISE EXCEPTION 'service_role required'; END IF;
  IF p_status NOT IN('sent','failed') THEN RAISE EXCEPTION 'invalid push job status'; END IF;
  UPDATE private.web_push_outbox q SET status=p_status,
    last_error=CASE WHEN p_status='failed' THEN left(coalesce(p_error,''),1000) ELSE '' END,
    sent_at=CASE WHEN p_status='sent' THEN now() ELSE q.sent_at END,
    next_attempt_at=CASE WHEN p_status='failed' THEN now()+make_interval(secs=>least(3600,(60*power(2::numeric,greatest(0,q.attempt_count-1)))::integer)) ELSE q.next_attempt_at END,
    locked_at=NULL,updated_at=now()
  WHERE q.id=p_outbox_id AND q.status='processing';
  GET DIAGNOSTICS v_changed=ROW_COUNT;
  RETURN v_changed=1;
END;
$function$;

REVOKE ALL ON FUNCTION public.sama_register_web_push(text,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.sama_unregister_web_push(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.sama_validate_web_push_worker_token(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sama_get_web_push_private_key() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sama_claim_web_push_batch(integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sama_get_web_push_job(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sama_delete_web_push_subscription(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sama_finish_web_push_job(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sama_register_web_push(text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sama_unregister_web_push(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sama_validate_web_push_worker_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sama_get_web_push_private_key() TO service_role;
GRANT EXECUTE ON FUNCTION public.sama_claim_web_push_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.sama_get_web_push_job(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sama_delete_web_push_subscription(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sama_finish_web_push_job(uuid,text,text) TO service_role;

DO $block$ DECLARE v_job_id bigint; BEGIN
  SELECT j.jobid INTO v_job_id FROM cron.job j WHERE j.jobname='sama-send-web-push' LIMIT 1;
  IF v_job_id IS NOT NULL THEN PERFORM cron.unschedule(v_job_id); END IF;
END; $block$;

SELECT cron.schedule('sama-send-web-push','* * * * *',$job$
  SELECT net.http_post(
    url := 'https://tbxxrnhcfuaeaatlrdtr.supabase.co/functions/v1/sama-send-web-push',
    headers := jsonb_build_object('Content-Type','application/json','x-web-push-worker-token',(
      SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='sama_web_push_worker_token' LIMIT 1
    )),
    body := jsonb_build_object('source','scheduled'),
    timeout_milliseconds := 20000
  );
$job$);
