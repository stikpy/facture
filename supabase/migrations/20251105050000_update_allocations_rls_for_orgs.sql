-- Mettre à jour les politiques RLS pour invoice_allocations
-- Permettre aux membres d'une organisation de voir toutes les allocations des factures de leur organisation

-- Supprimer l'ancienne politique restrictive
DROP POLICY IF EXISTS "Users can view their own allocations" ON public.invoice_allocations;

-- Créer une nouvelle politique qui permet aux membres d'une organisation
-- de voir toutes les allocations des factures de leur organisation
CREATE POLICY "Users can view allocations from their organization"
  ON public.invoice_allocations
  FOR SELECT
  USING (
    -- L'utilisateur peut voir ses propres allocations
    auth.uid() = user_id
    OR
    -- OU l'utilisateur peut voir les allocations des factures de son organisation
    EXISTS (
      SELECT 1
      FROM public.invoices i
      INNER JOIN public.organization_members om ON om.organization_id = i.organization_id
      WHERE i.id = invoice_allocations.invoice_id
        AND om.user_id = auth.uid()
        AND i.organization_id IS NOT NULL
    )
  );

COMMENT ON POLICY "Users can view allocations from their organization" ON public.invoice_allocations IS 
  'Permet aux membres d''une organisation de voir toutes les allocations des factures de leur organisation, pas seulement les leurs';

