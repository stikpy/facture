-- Met à jour la contrainte de vérification du statut des factures pour intégrer
-- les nouveaux statuts: queued, duplicate, awaiting_user

DO $$
BEGIN
  -- Supprime l'ancienne contrainte si elle existe
  IF EXISTS (
    SELECT 1 
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'invoices' AND c.conname = 'invoices_status_check'
  ) THEN
    ALTER TABLE public.invoices DROP CONSTRAINT invoices_status_check;
  END IF;
END$$;

-- Ajoute la nouvelle contrainte de check
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (status IN (
    'pending',
    'queued',
    'processing',
    'completed',
    'error',
    'duplicate',
    'awaiting_user'
  ));


