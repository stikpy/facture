-- Table pour gérer les produits par fournisseur et par organisation
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  reference TEXT NOT NULL, -- Référence produit (ex: "018422", "022209")
  name TEXT NOT NULL, -- Nom du produit
  price DECIMAL(12, 4) NOT NULL DEFAULT 0, -- Prix unitaire HT
  vat_rate DECIMAL(5, 2), -- Taux de TVA en pourcentage (ex: 5.5, 10, 20)
  vat_code TEXT, -- Code TVA (ex: "102", "200")
  unit TEXT DEFAULT 'pièce', -- Unité de mesure (kg, pièce, litre, etc.)
  description TEXT, -- Description optionnelle
  is_active BOOLEAN NOT NULL DEFAULT true, -- Produit actif ou non
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Contrainte d'unicité : un produit avec la même référence ne peut exister qu'une fois par fournisseur et organisation
  CONSTRAINT uniq_product_per_supplier_org UNIQUE (organization_id, supplier_id, reference)
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_products_org_supplier 
  ON products(organization_id, supplier_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_products_reference 
  ON products(reference);

CREATE INDEX IF NOT EXISTS idx_products_supplier 
  ON products(supplier_id) WHERE is_active = true;

-- Trigger pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_products_updated_at();

-- RLS: Les membres de l'organisation peuvent voir et gérer les produits de leur organisation
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Supprimer les politiques si elles existent déjà
DROP POLICY IF EXISTS "products_select_org_members" ON products;
DROP POLICY IF EXISTS "products_insert_org_members" ON products;
DROP POLICY IF EXISTS "products_update_org_members" ON products;
DROP POLICY IF EXISTS "products_delete_org_members" ON products;

-- Politique SELECT: Les membres peuvent voir les produits de leur organisation
CREATE POLICY "products_select_org_members"
  ON products
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Politique INSERT: Les membres peuvent créer des produits pour leur organisation
CREATE POLICY "products_insert_org_members"
  ON products
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Politique UPDATE: Les membres peuvent modifier les produits de leur organisation
CREATE POLICY "products_update_org_members"
  ON products
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Politique DELETE: Les membres peuvent supprimer les produits de leur organisation
CREATE POLICY "products_delete_org_members"
  ON products
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE products IS 'Catalogue de produits par fournisseur et par organisation';
COMMENT ON COLUMN products.reference IS 'Référence produit unique par fournisseur et organisation';
COMMENT ON COLUMN products.price IS 'Prix unitaire HT';
COMMENT ON COLUMN products.vat_rate IS 'Taux de TVA en pourcentage (ex: 5.5 pour 5.5%)';

