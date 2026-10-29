
-- Remove historical table-level privileges first; then regrant only required columns.
REVOKE ALL ON TABLE public.notification_settings FROM PUBLIC, anon, authenticated;
REVOKE SELECT(webhook_token), UPDATE(webhook_token,id)
  ON TABLE public.notification_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT(id,order_notification_email,updated_at)
  ON TABLE public.notification_settings TO authenticated;
GRANT UPDATE(order_notification_email,updated_at)
  ON TABLE public.notification_settings TO authenticated;
