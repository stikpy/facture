-- Persistance du taux de TVA (au moment de la saisie)
ALTER TABLE public.invoice_allocations
ADD COLUMN IF NOT EXISTS vat_rate numeric;

COMMENT ON COLUMN public.invoice_allocations.vat_rate IS 'Taux de TVA (%) saisi/calculé au moment de l\'allocation';

