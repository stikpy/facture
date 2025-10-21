-- Adapter la table suppliers existante pour les organisations
-- Ajouter les colonnes manquantes pour la gestion complète des fournisseurs

-- Ajouter les colonnes nécessaires si elles n'existent pas
ALTER TABLE public.suppliers 
ADD COLUMN IF NOT EXISTS legal_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS city VARCHAR(100),
ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20),
ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'FRANCE',
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS website VARCHAR(255),
ADD COLUMN IF NOT EXISTS siret VARCHAR(20),
ADD COLUMN IF NOT EXISTS vat_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS registration_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS legal_form VARCHAR(100),
ADD COLUMN IF NOT EXISTS capital DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS activity_code VARCHAR(20),
ADD COLUMN IF NOT EXISTS bank_details JSONB,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Renommer display_name en name si nécessaire (garder les deux pour compatibilité)
ALTER TABLE public.suppliers 
ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- Copier display_name vers name si name est vide
UPDATE public.suppliers 
SET name = display_name 
WHERE name IS NULL OR name = '';

-- Index pour les recherches fréquentes
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_display_name ON public.suppliers(display_name);
CREATE INDEX IF NOT EXISTS idx_suppliers_siret ON public.suppliers(siret);
CREATE INDEX IF NOT EXISTS idx_suppliers_vat_number ON public.suppliers(vat_number);
CREATE INDEX IF NOT EXISTS idx_suppliers_organization_id ON public.suppliers(organization_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON public.suppliers(is_active);
CREATE INDEX IF NOT EXISTS idx_suppliers_normalized_key ON public.suppliers(normalized_key);

-- RLS (Row Level Security) - activer si pas déjà fait
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- Les politiques RLS seront créées dans une migration séparée après user_organizations

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION update_suppliers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Supprimer l'ancien trigger s'il existe
DROP TRIGGER IF EXISTS trigger_update_suppliers_updated_at ON public.suppliers;

CREATE TRIGGER trigger_update_suppliers_updated_at
    BEFORE UPDATE ON public.suppliers
    FOR EACH ROW
    EXECUTE FUNCTION update_suppliers_updated_at();

-- Commentaires pour la documentation
COMMENT ON TABLE public.suppliers IS 'Table des fournisseurs avec informations complètes';
COMMENT ON COLUMN public.suppliers.name IS 'Nom commercial du fournisseur';
COMMENT ON COLUMN public.suppliers.display_name IS 'Nom d''affichage du fournisseur (legacy)';
COMMENT ON COLUMN public.suppliers.normalized_key IS 'Clé normalisée pour la recherche';
COMMENT ON COLUMN public.suppliers.code IS 'Code unique du fournisseur';
COMMENT ON COLUMN public.suppliers.siret IS 'Numéro SIRET unique';
COMMENT ON COLUMN public.suppliers.vat_number IS 'Numéro de TVA intracommunautaire';
COMMENT ON COLUMN public.suppliers.bank_details IS 'Détails bancaires (IBAN, BIC, etc.) en JSON';
COMMENT ON COLUMN public.suppliers.is_active IS 'Fournisseur actif ou archivé';
