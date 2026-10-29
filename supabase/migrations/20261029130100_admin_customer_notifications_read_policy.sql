ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read customer notifications" ON public.notifications;
CREATE POLICY "Admins read customer notifications"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING ((SELECT public.sama_is_admin()));

GRANT SELECT ON public.notifications TO authenticated;
