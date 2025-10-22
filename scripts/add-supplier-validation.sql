-- SQL à exécuter manuellement dans Supabase pour ajouter la validation des fournisseurs

-- Ajouter le statut de validation
ALTER TABLE public.suppliers 
ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending', 'validated', 'rejected'));

-- Ajouter un index
CREATE INDEX IF NOT EXISTS idx_suppliers_validation_status ON public.suppliers(validation_status);

-- Mettre à jour les fournisseurs existants comme validés
UPDATE public.suppliers SET validation_status = 'validated' WHERE validation_status IS NULL OR validation_status = '';

-- Vérification
SELECT id, display_name, code, validation_status FROM public.suppliers LIMIT 10;

