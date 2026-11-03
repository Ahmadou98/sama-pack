-- Store configurable public social network links for the storefront footer.
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.settings.social_links IS
  'Liens publics des réseaux sociaux, avec un indicateur enabled par réseau.';

-- The field is public display data; grant read access without exposing secret settings.
GRANT SELECT (social_links) ON TABLE public.settings TO anon, authenticated;

-- Settings updates are still restricted by the existing owner-only RLS policy.
GRANT UPDATE (social_links) ON TABLE public.settings TO authenticated;
