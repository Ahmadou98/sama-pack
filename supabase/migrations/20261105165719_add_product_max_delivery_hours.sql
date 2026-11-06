ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS max_delivery_hours integer;

ALTER TABLE public.products
  ALTER COLUMN max_delivery_hours SET DEFAULT 24;

UPDATE public.products
SET max_delivery_hours = 24
WHERE max_delivery_hours IS NULL;

ALTER TABLE public.products
  ALTER COLUMN max_delivery_hours SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_max_delivery_hours_positive'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_max_delivery_hours_positive
      CHECK (max_delivery_hours >= 1);
  END IF;
END $$;
