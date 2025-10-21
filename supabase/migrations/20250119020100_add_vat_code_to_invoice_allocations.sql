-- Ajoute la persistance du code TVA par ligne de ventilation
-- 1) Ajouter la colonne vat_code (texte, nullable)
ALTER TABLE public.invoice_allocations
ADD COLUMN IF NOT EXISTS vat_code text;

-- 2) Optionnel: index si filtrage futur par vat_code
-- CREATE INDEX IF NOT EXISTS idx_invoice_allocations_vat_code ON public.invoice_allocations(vat_code);

-- 3) Vérification
COMMENT ON COLUMN public.invoice_allocations.vat_code IS 'Code TVA sélectionné pour la ligne (ex: A, S, I...), nullable';

