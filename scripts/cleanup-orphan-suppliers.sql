-- Nettoyer les fournisseurs créés sans organization_id
-- Ces fournisseurs ne sont pas visibles à cause des politiques RLS

-- Afficher les fournisseurs orphelins
SELECT 
  id, 
  code, 
  display_name, 
  validation_status, 
  organization_id,
  created_at
FROM public.suppliers
WHERE organization_id IS NULL;

-- Supprimer les fournisseurs orphelins (décommenter pour exécuter)
-- DELETE FROM public.suppliers WHERE organization_id IS NULL;

-- Note: Avant de supprimer, vérifier qu'aucune facture ne référence ces fournisseurs
-- SELECT COUNT(*) FROM public.invoices WHERE supplier_id IN (
--   SELECT id FROM public.suppliers WHERE organization_id IS NULL
-- );

