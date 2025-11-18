-- Ajouter le champ item_indices pour stocker les indices des articles extraits utilisés dans chaque allocation
ALTER TABLE public.invoice_allocations 
ADD COLUMN IF NOT EXISTS item_indices JSONB DEFAULT '[]'::jsonb;

-- Index pour les requêtes sur item_indices
CREATE INDEX IF NOT EXISTS idx_invoice_allocations_item_indices 
ON public.invoice_allocations USING GIN (item_indices);

-- Commentaire pour documenter le champ
COMMENT ON COLUMN public.invoice_allocations.item_indices IS 'Array JSON des indices des articles extraits (items) utilisés dans cette allocation. Ex: [0, 1, 2] signifie que les articles aux indices 0, 1 et 2 ont été ventilés.';

