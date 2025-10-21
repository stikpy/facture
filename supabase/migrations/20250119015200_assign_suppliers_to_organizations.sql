-- Assigner les fournisseurs existants à l'organisation par défaut
-- Cette migration assume qu'il y a au moins une organisation dans le système

-- Créer une organisation par défaut si elle n'existe pas
INSERT INTO public.organizations (name)
SELECT 'Organisation par défaut'
WHERE NOT EXISTS (SELECT 1 FROM public.organizations LIMIT 1);

-- Assigner tous les fournisseurs existants à l'organisation par défaut
UPDATE public.suppliers 
SET organization_id = (
    SELECT id FROM public.organizations 
    WHERE name = 'Organisation par défaut' 
    LIMIT 1
)
WHERE organization_id IS NULL;

-- Assigner tous les utilisateurs existants à l'organisation par défaut
INSERT INTO public.organization_members (user_id, organization_id, role)
SELECT 
    u.id,
    o.id,
    'admin'
FROM auth.users u
CROSS JOIN public.organizations o
WHERE o.name = 'Organisation par défaut'
AND NOT EXISTS (
    SELECT 1 FROM public.organization_members om 
    WHERE om.user_id = u.id
);

-- Mettre à jour les factures existantes pour les lier aux fournisseurs
-- Cette partie sera gérée par la migration précédente (add_supplier_relation_to_invoices.sql)

-- Commentaire final
COMMENT ON TABLE public.suppliers IS 'Table des fournisseurs liés aux organisations';
