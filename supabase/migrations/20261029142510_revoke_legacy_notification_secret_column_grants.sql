
-- Remove legacy column-level grants: table-level REVOKE does not remove them.
REVOKE SELECT(webhook_token), UPDATE(webhook_token,id)
ON public.notification_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT(id,order_notification_email,updated_at)
ON public.notification_settings TO authenticated;
GRANT UPDATE(order_notification_email,updated_at)
ON public.notification_settings TO authenticated;
