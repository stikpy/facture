-- Migration pour créer le système de vectorisation persistant avec pgvector
-- Permet de stocker les embeddings des documents pour le chatbot RAG

-- 1. Activer l'extension pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Table pour stocker les embeddings des documents (factures)
CREATE TABLE IF NOT EXISTS document_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  content TEXT NOT NULL, -- Le texte du chunk de document
  metadata JSONB DEFAULT '{}'::jsonb, -- Métadonnées (type, date, fournisseur, etc.)
  embedding vector(1536), -- Embedding OpenAI (dimension 1536 pour text-embedding-3-small)
  chunk_index INTEGER DEFAULT 0, -- Index du chunk dans le document
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Index pour la recherche par similarité vectorielle
CREATE INDEX IF NOT EXISTS idx_document_embeddings_embedding 
ON document_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 4. Index pour les requêtes par organisation et facture
CREATE INDEX IF NOT EXISTS idx_document_embeddings_org_invoice 
ON document_embeddings(organization_id, invoice_id);

CREATE INDEX IF NOT EXISTS idx_document_embeddings_invoice 
ON document_embeddings(invoice_id);

-- 5. Index GIN pour les recherches dans les métadonnées JSONB
CREATE INDEX IF NOT EXISTS idx_document_embeddings_metadata 
ON document_embeddings USING GIN (metadata);

-- 6. Trigger pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_document_embeddings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_document_embeddings_updated_at
BEFORE UPDATE ON document_embeddings
FOR EACH ROW
EXECUTE FUNCTION update_document_embeddings_updated_at();

-- 7. Activer RLS (Row Level Security)
ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY;

-- 8. Politiques RLS : les membres d'une organisation peuvent voir les embeddings de leur organisation
CREATE POLICY "Organization members can view embeddings"
  ON document_embeddings FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Organization members can insert embeddings"
  ON document_embeddings FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Organization members can update embeddings"
  ON document_embeddings FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Organization members can delete embeddings"
  ON document_embeddings FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- 9. Fonction pour la recherche par similarité vectorielle
CREATE OR REPLACE FUNCTION match_document_embeddings(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  filter_organization_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  invoice_id uuid,
  organization_id uuid,
  content text,
  metadata jsonb,
  similarity float,
  chunk_index integer
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.id,
    de.invoice_id,
    de.organization_id,
    de.content,
    de.metadata,
    1 - (de.embedding <=> query_embedding) as similarity,
    de.chunk_index
  FROM document_embeddings de
  WHERE 
    (filter_organization_id IS NULL OR de.organization_id = filter_organization_id)
    AND (1 - (de.embedding <=> query_embedding)) >= match_threshold
  ORDER BY de.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 10. Commentaires pour documentation
COMMENT ON TABLE document_embeddings IS 'Stockage des embeddings vectoriels des documents pour la recherche sémantique et le chatbot RAG';
COMMENT ON COLUMN document_embeddings.embedding IS 'Vecteur d''embedding OpenAI (1536 dimensions pour text-embedding-3-small)';
COMMENT ON COLUMN document_embeddings.content IS 'Contenu textuel du chunk de document';
COMMENT ON COLUMN document_embeddings.metadata IS 'Métadonnées JSONB (supplier_name, invoice_date, invoice_number, etc.)';
COMMENT ON COLUMN document_embeddings.chunk_index IS 'Index du chunk dans le document (pour reconstruire le contexte)';
COMMENT ON FUNCTION match_document_embeddings IS 'Fonction pour rechercher des documents similaires par similarité vectorielle cosine';

