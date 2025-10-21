-- Créer la table invoice_allocations pour stocker les ventilations comptables
CREATE TABLE IF NOT EXISTS public.invoice_allocations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_code TEXT NOT NULL,
    label TEXT,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_invoice_allocations_invoice_id ON public.invoice_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_allocations_user_id ON public.invoice_allocations(user_id);

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_invoice_allocations_updated_at 
    BEFORE UPDATE ON public.invoice_allocations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS (Row Level Security)
ALTER TABLE public.invoice_allocations ENABLE ROW LEVEL SECURITY;

-- Politique : les utilisateurs ne peuvent voir que leurs propres allocations
CREATE POLICY "Users can view their own allocations" ON public.invoice_allocations
    FOR SELECT USING (auth.uid() = user_id);

-- Politique : les utilisateurs peuvent insérer leurs propres allocations
CREATE POLICY "Users can insert their own allocations" ON public.invoice_allocations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Politique : les utilisateurs peuvent modifier leurs propres allocations
CREATE POLICY "Users can update their own allocations" ON public.invoice_allocations
    FOR UPDATE USING (auth.uid() = user_id);

-- Politique : les utilisateurs peuvent supprimer leurs propres allocations
CREATE POLICY "Users can delete their own allocations" ON public.invoice_allocations
    FOR DELETE USING (auth.uid() = user_id);
