CREATE TABLE IF NOT EXISTS public.courier_identity_documents (
  courier_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('national_id','passport')),
  legal_name text NOT NULL CHECK (char_length(btrim(legal_name)) BETWEEN 2 AND 160),
  document_number text NOT NULL CHECK (char_length(btrim(document_number)) BETWEEN 4 AND 50),
  issuing_country text NOT NULL DEFAULT 'Sénégal' CHECK (char_length(btrim(issuing_country)) BETWEEN 2 AND 80),
  expires_on date,
  front_image_path text NOT NULL,
  back_image_path text,
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','approved','rejected')),
  rejection_reason text NOT NULL DEFAULT '' CHECK (char_length(rejection_reason) <= 1000),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT courier_identity_document_back_check
    CHECK ((document_type = 'passport' AND back_image_path IS NULL) OR (document_type = 'national_id' AND back_image_path IS NOT NULL))
);
ALTER TABLE public.courier_identity_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.courier_identity_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.courier_identity_documents TO authenticated;
GRANT ALL ON public.courier_identity_documents TO service_role;
DROP POLICY IF EXISTS "Couriers can read own identity document admins can review" ON public.courier_identity_documents;
CREATE POLICY "Couriers can read own identity document admins can review"
ON public.courier_identity_documents FOR SELECT TO authenticated
USING (
  courier_id = (SELECT auth.uid())
  OR private.sama_is_owner()
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('courier-identity', 'courier-identity', false, 6291456, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 6291456,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];

DROP POLICY IF EXISTS "Couriers upload own identity documents" ON storage.objects;
CREATE POLICY "Couriers upload own identity documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'courier-identity'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'courier')
);

DROP POLICY IF EXISTS "Couriers and owner read identity documents" ON storage.objects;
CREATE POLICY "Couriers and owner read identity documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'courier-identity'
  AND (
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
    OR private.sama_is_owner()
  )
);

GRANT INSERT, SELECT ON storage.objects TO authenticated;
