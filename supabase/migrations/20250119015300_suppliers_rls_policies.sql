-- Politiques RLS pour la table suppliers
-- Cette migration s'exécute après la création de user_organizations

-- Supprimer les anciennes politiques si elles existent
DROP POLICY IF EXISTS "Users can view suppliers from their organization" ON public.suppliers;
DROP POLICY IF EXISTS "Users can create suppliers in their organization" ON public.suppliers;
DROP POLICY IF EXISTS "Users can update suppliers from their organization" ON public.suppliers;
DROP POLICY IF EXISTS "Users can delete suppliers from their organization" ON public.suppliers;

-- Politique : les utilisateurs ne voient que les fournisseurs de leur organisation
CREATE POLICY "Users can view suppliers from their organization" ON public.suppliers
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid()
        )
    );

-- Politique : les utilisateurs peuvent créer des fournisseurs dans leur organisation
CREATE POLICY "Users can create suppliers in their organization" ON public.suppliers
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid()
        )
    );

-- Politique : les utilisateurs peuvent modifier les fournisseurs de leur organisation
CREATE POLICY "Users can update suppliers from their organization" ON public.suppliers
    FOR UPDATE USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid()
        )
    );

-- Politique : les utilisateurs peuvent supprimer les fournisseurs de leur organisation
CREATE POLICY "Users can delete suppliers from their organization" ON public.suppliers
    FOR DELETE USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid()
        )
    );
