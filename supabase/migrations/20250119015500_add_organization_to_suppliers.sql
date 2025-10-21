-- Ajouter la colonne organization_id à la table suppliers existante
-- Cette migration est spécifique pour la base de production

-- Ajouter la colonne organization_id si elle n'existe pas
ALTER TABLE public.suppliers 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Créer un index pour les performances
CREATE INDEX IF NOT EXISTS idx_suppliers_organization_id ON public.suppliers(organization_id);

-- Créer une organisation par défaut si elle n'existe pas
INSERT INTO public.organizations (id, name, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Organisation par défaut',
  NOW(),
  NOW()
)
ON CONFLICT (name) DO NOTHING;

-- Assigner tous les fournisseurs existants à l'organisation par défaut
UPDATE public.suppliers 
SET organization_id = (
  SELECT id FROM public.organizations 
  WHERE name = 'Organisation par défaut' 
  LIMIT 1
)
WHERE organization_id IS NULL;

-- Commentaire pour la documentation
COMMENT ON COLUMN public.suppliers.organization_id IS 'ID de l''organisation à laquelle appartient le fournisseur';
