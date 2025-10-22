-- Ajouter le statut de validation pour les fournisseurs
ALTER TABLE public.suppliers 
ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending', 'validated', 'rejected'));

-- Ajouter un index pour les recherches par statut
CREATE INDEX IF NOT EXISTS idx_suppliers_validation_status ON public.suppliers(validation_status);

-- Mettre à jour les fournisseurs existants comme validés
UPDATE public.suppliers SET validation_status = 'validated' WHERE validation_status IS NULL;

-- Ajouter un commentaire
COMMENT ON COLUMN public.suppliers.validation_status IS 'Statut de validation du fournisseur: pending (en attente), validated (validé), rejected (rejeté)';

