ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS reference_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS reference_price_basis text,
  ADD COLUMN IF NOT EXISTS reference_price_note text;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_reference_price_consistency_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_reference_price_consistency_check
  CHECK (
    (
      reference_price IS NULL
      AND reference_price_basis IS NULL
      AND reference_price_note IS NULL
    )
    OR
    (
      reference_price IS NOT NULL
      AND reference_price > price
      AND reference_price_basis IN ('previous_price', 'recommended_price')
      AND NULLIF(BTRIM(reference_price_note), '') IS NOT NULL
    )
  );

COMMENT ON COLUMN public.products.reference_price IS
  'Prix de référence justifié, affiché barré uniquement s’il est supérieur au prix de vente normal.';

COMMENT ON COLUMN public.products.reference_price_basis IS
  'Base du prix de référence : ancien prix réellement pratiqué ou prix conseillé par marque/fournisseur.';

COMMENT ON COLUMN public.products.reference_price_note IS
  'Justificatif interne du prix de référence : période d’application ou source du prix conseillé.';
