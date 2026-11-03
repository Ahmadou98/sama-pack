CREATE TABLE IF NOT EXISTS private.product_reference_price_notes (
  product_id text PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  note text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 1 AND 240),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.product_reference_price_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.product_reference_price_notes FROM PUBLIC, anon, authenticated;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_reference_price_consistency_check;

ALTER TABLE public.products
  DROP COLUMN IF EXISTS reference_price_note;

ALTER TABLE public.products
  ADD CONSTRAINT products_reference_price_consistency_check
  CHECK (
    (reference_price IS NULL AND reference_price_basis IS NULL)
    OR (
      reference_price IS NOT NULL
      AND reference_price > price
      AND reference_price_basis IN ('previous_price', 'recommended_price')
    )
  );

CREATE OR REPLACE FUNCTION public.sama_get_product_reference_price_notes()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT private.sama_is_owner() THEN
    RAISE EXCEPTION 'Accès réservé à l’administrateur propriétaire.';
  END IF;

  RETURN COALESCE(
    (SELECT jsonb_object_agg(product_id, note)
     FROM private.product_reference_price_notes),
    '{}'::jsonb
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.sama_set_product_reference_price_note(
  p_product_id text,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  v_note text := NULLIF(BTRIM(p_note), '');
BEGIN
  IF auth.uid() IS NULL OR NOT private.sama_is_owner() THEN
    RAISE EXCEPTION 'Accès réservé à l’administrateur propriétaire.';
  END IF;

  IF p_product_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = p_product_id
  ) THEN
    RAISE EXCEPTION 'Article introuvable.';
  END IF;

  IF v_note IS NULL THEN
    DELETE FROM private.product_reference_price_notes
    WHERE product_id = p_product_id;
  ELSE
    IF char_length(v_note) > 240 THEN
      RAISE EXCEPTION 'La justification ne peut pas dépasser 240 caractères.';
    END IF;

    INSERT INTO private.product_reference_price_notes(product_id, note, updated_at)
    VALUES (p_product_id, v_note, now())
    ON CONFLICT (product_id) DO UPDATE
      SET note = EXCLUDED.note, updated_at = now();
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.sama_get_product_reference_price_notes() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sama_set_product_reference_price_note(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sama_get_product_reference_price_notes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sama_set_product_reference_price_note(text, text) TO authenticated;
