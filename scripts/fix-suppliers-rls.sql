-- Fix RLS policies for suppliers table to allow updates

-- 1. Vérifier les politiques existantes
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'suppliers';

-- 2. Supprimer les anciennes politiques si nécessaire (commenté par défaut)
-- DROP POLICY IF EXISTS "Users can view suppliers in their organization" ON public.suppliers;
-- DROP POLICY IF EXISTS "Users can insert suppliers" ON public.suppliers;
-- DROP POLICY IF EXISTS "Users can update suppliers" ON public.suppliers;

-- 3. Créer/remplacer les politiques pour permettre les opérations CRUD

-- SELECT: Les utilisateurs peuvent voir les fournisseurs de leur organisation
DROP POLICY IF EXISTS "Users can view suppliers in their organization" ON public.suppliers;
CREATE POLICY "Users can view suppliers in their organization"
ON public.suppliers
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id 
    FROM public.users 
    WHERE id = auth.uid()
  )
);

-- INSERT: Les utilisateurs peuvent créer des fournisseurs dans leur organisation
DROP POLICY IF EXISTS "Users can insert suppliers" ON public.suppliers;
CREATE POLICY "Users can insert suppliers"
ON public.suppliers
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id IN (
    SELECT organization_id 
    FROM public.users 
    WHERE id = auth.uid()
  )
);

-- UPDATE: Les utilisateurs peuvent modifier les fournisseurs de leur organisation
DROP POLICY IF EXISTS "Users can update suppliers" ON public.suppliers;
CREATE POLICY "Users can update suppliers"
ON public.suppliers
FOR UPDATE
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id 
    FROM public.users 
    WHERE id = auth.uid()
  )
)
WITH CHECK (
  organization_id IN (
    SELECT organization_id 
    FROM public.users 
    WHERE id = auth.uid()
  )
);

-- DELETE: Les utilisateurs peuvent supprimer les fournisseurs de leur organisation (optionnel)
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

-- 4. Vérifier que RLS est activé sur la table
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- 5. Vérifier les nouvelles politiques
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'suppliers';

