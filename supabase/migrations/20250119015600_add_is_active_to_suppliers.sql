-- Ajouter la colonne is_active à la table suppliers
-- Cette migration ajoute la colonne is_active avec une valeur par défaut

-- Ajouter la colonne is_active si elle n'existe pas
ALTER TABLE public.suppliers 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Mettre à jour tous les fournisseurs existants pour qu'ils soient actifs par défaut
UPDATE public.suppliers 
SET is_active = true 
WHERE is_active IS NULL;

-- Créer un index pour les performances
CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON public.suppliers(is_active);

-- Commentaire pour la documentation
COMMENT ON COLUMN public.suppliers.is_active IS 'Indique si le fournisseur est actif (true) ou inactif (false)';
