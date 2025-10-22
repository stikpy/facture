-- Ajouter la politique RLS pour permettre la suppression de fournisseurs

-- DELETE: Les utilisateurs peuvent supprimer les fournisseurs de leur organisation
DROP POLICY IF EXISTS "Users can delete suppliers" ON public.suppliers;
CREATE POLICY "Users can delete suppliers"
ON public.suppliers
FOR DELETE
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id 
    FROM public.users 
    WHERE id = auth.uid()
  )
);

-- Vérifier les politiques
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'suppliers';

