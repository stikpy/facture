-- Table pour suivre la consommation de tokens par organisation
CREATE TABLE IF NOT EXISTS token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  model_name TEXT NOT NULL DEFAULT 'gpt-5',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  -- Coûts (en USD)
  input_cost DECIMAL(12, 8) NOT NULL DEFAULT 0,
  output_cost DECIMAL(12, 8) NOT NULL DEFAULT 0,
  total_cost DECIMAL(12, 8) NOT NULL DEFAULT 0,
  -- Coût majoré de 5% (prix facturé au client)
  total_cost_marked_up DECIMAL(12, 8) NOT NULL DEFAULT 0,
  operation_type TEXT NOT NULL DEFAULT 'extraction', -- 'extraction', 'classification', 'embedding'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour les requêtes par organisation et date
CREATE INDEX IF NOT EXISTS idx_token_usage_org_date 
  ON token_usage(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_token_usage_invoice 
  ON token_usage(invoice_id) WHERE invoice_id IS NOT NULL;

-- RLS: Les membres de l'organisation peuvent voir leur consommation
ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;

-- Supprimer les politiques si elles existent déjà (pour permettre la réexécution de la migration)
DROP POLICY IF EXISTS "token_usage_select_org_members" ON token_usage;
DROP POLICY IF EXISTS "token_usage_insert_service_role" ON token_usage;

CREATE POLICY "token_usage_select_org_members"
  ON token_usage
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Seul le système (via service role) peut insérer
CREATE POLICY "token_usage_insert_service_role"
  ON token_usage
  FOR INSERT
  WITH CHECK (true); -- Service role bypass RLS

COMMENT ON TABLE token_usage IS 'Suivi de la consommation de tokens OpenAI par organisation';
COMMENT ON COLUMN token_usage.total_cost_marked_up IS 'Coût total avec majoration de 5%';

