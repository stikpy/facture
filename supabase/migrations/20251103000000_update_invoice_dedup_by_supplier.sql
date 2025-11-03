-- Renforcer la déduplication: numéro unique par (organization_id, supplier_id)

-- Supprimer l'ancien index si présent (unicité par user_id uniquement)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'uniq_invoice_per_user_number'
  ) THEN
    EXECUTE 'DROP INDEX IF EXISTS uniq_invoice_per_user_number';
  END IF;
END$$;

-- Nouvel index unique partiel: nécessite supplier_id et organization_id non nuls et numéro présent
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoice_per_org_supplier_number
ON public.invoices (organization_id, supplier_id, (extracted_data->>'invoice_number'))
WHERE organization_id IS NOT NULL
  AND supplier_id IS NOT NULL
  AND extracted_data ? 'invoice_number'
  AND (extracted_data->>'invoice_number') IS NOT NULL
  AND (extracted_data->>'invoice_number') <> '';


