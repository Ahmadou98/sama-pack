-- Preserve the original unit acquisition cost when product_costs.supplier_price
-- is used for the active sale unit (e.g. a carton).
ALTER TABLE public.product_costs
  ADD COLUMN IF NOT EXISTS supplier_unit_price numeric;

UPDATE public.product_costs pc
SET supplier_unit_price = pc.supplier_price
FROM public.products p
WHERE p.id = pc.product_id
  AND p.catalog_type IN ('product','tool')
  AND p.sale_unit = 'unit'
  AND pc.supplier_unit_price IS NULL
  AND pc.supplier_price IS NOT NULL;
