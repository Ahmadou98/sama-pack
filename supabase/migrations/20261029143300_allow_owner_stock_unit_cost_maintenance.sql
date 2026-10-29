
-- The owner can maintain stock unit cost; the trigger blocks associates from changing it.
GRANT INSERT(unit_cost), UPDATE(unit_cost) ON public.stock TO authenticated;
