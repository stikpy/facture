-- Ajouter la colonne supplier_id à la table invoices
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;

-- Index pour les jointures fréquentes
CREATE INDEX IF NOT EXISTS idx_invoices_supplier_id ON public.invoices(supplier_id);

-- Commentaire
COMMENT ON COLUMN public.invoices.supplier_id IS 'Référence vers le fournisseur de la facture';

-- Fonction pour migrer les données existantes (supplier_name vers suppliers)
CREATE OR REPLACE FUNCTION migrate_existing_suppliers()
RETURNS void AS $$
DECLARE
    invoice_record RECORD;
    supplier_record RECORD;
    new_supplier_id UUID;
    normalized_name TEXT;
BEGIN
    -- Parcourir toutes les factures qui ont un supplier_name mais pas de supplier_id
    FOR invoice_record IN 
        SELECT DISTINCT 
            i.id,
            i.organization_id,
            i.extracted_data->>'supplier_name' as supplier_name,
            i.extracted_data->>'supplier_address' as supplier_address,
            i.extracted_data->>'supplier_email' as supplier_email,
            i.extracted_data->>'supplier_phone' as supplier_phone,
            i.extracted_data->>'supplier_vat_number' as supplier_vat_number
        FROM public.invoices i
        WHERE i.extracted_data->>'supplier_name' IS NOT NULL 
        AND i.supplier_id IS NULL
        AND i.extracted_data->>'supplier_name' != ''
    LOOP
        -- Normaliser le nom pour la recherche (comme dans ta table existante)
        normalized_name = LOWER(TRIM(REGEXP_REPLACE(invoice_record.supplier_name, '[^a-zA-Z0-9\s]', '', 'g')));
        
        -- Vérifier si un fournisseur avec ce nom normalisé existe déjà dans cette organisation
        SELECT id INTO new_supplier_id
        FROM public.suppliers 
        WHERE normalized_key = normalized_name 
        AND organization_id = invoice_record.organization_id
        LIMIT 1;
        
        -- Si le fournisseur n'existe pas, le créer avec la structure existante
        IF new_supplier_id IS NULL THEN
            -- Générer un code unique (format: PREFIX-001)
            DECLARE
                prefix TEXT := UPPER(SUBSTRING(REGEXP_REPLACE(invoice_record.supplier_name, '[^a-zA-Z]', '', 'g'), 1, 6));
                code_counter INTEGER := 1;
                new_code TEXT;
            BEGIN
                -- Trouver le prochain numéro disponible pour ce préfixe
                SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM '[0-9]+$') AS INTEGER)), 0) + 1
                INTO code_counter
                FROM public.suppliers 
                WHERE code LIKE prefix || '-%';
                
                new_code := prefix || '-' || LPAD(code_counter::TEXT, 3, '0');
                
                INSERT INTO public.suppliers (
                    name,
                    display_name,
                    normalized_key,
                    code,
                    address,
                    email,
                    phone,
                    vat_number,
                    organization_id,
                    created_by
                ) VALUES (
                    invoice_record.supplier_name,
                    invoice_record.supplier_name,
                    normalized_name,
                    new_code,
                    invoice_record.supplier_address,
                    invoice_record.supplier_email,
                    invoice_record.supplier_phone,
                    invoice_record.supplier_vat_number,
                    invoice_record.organization_id,
                    (SELECT user_id FROM public.user_organizations 
                     WHERE organization_id = invoice_record.organization_id 
                     LIMIT 1)
                ) RETURNING id INTO new_supplier_id;
            END;
        END IF;
        
        -- Mettre à jour toutes les factures avec ce fournisseur
        UPDATE public.invoices 
        SET supplier_id = new_supplier_id
        WHERE organization_id = invoice_record.organization_id
        AND extracted_data->>'supplier_name' = invoice_record.supplier_name
        AND supplier_id IS NULL;
        
    END LOOP;
    
    RAISE NOTICE 'Migration des fournisseurs terminée';
END;
$$ LANGUAGE plpgsql;

-- Exécuter la migration
SELECT migrate_existing_suppliers();

-- Supprimer la fonction temporaire
DROP FUNCTION migrate_existing_suppliers();
