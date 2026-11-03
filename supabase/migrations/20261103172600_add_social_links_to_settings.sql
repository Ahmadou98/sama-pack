-- Store configurable public social network links for the storefront footer.
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.settings.social_links IS
  'Liens publics des réseaux sociaux, avec un indicateur enabled par réseau.';
