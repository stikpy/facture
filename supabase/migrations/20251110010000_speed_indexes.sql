-- Accélération des recherches Produits/Factures
-- Crée/ajuste les colonnes et index si absents. Sûr à rejouer.

-- Extension nécessaire pour l'index trigram
create extension if not exists pg_trgm;

-- Invoices: filtre par organisation et tri par date
create index if not exists idx_invoices_org_created_at
  on public.invoices (organization_id, created_at desc);

-- Products: recherche par référence dans une org
create index if not exists idx_products_org_reference
  on public.products (organization_id, reference);

-- Invoice items: ajouter colonnes manquantes puis indexer
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'invoice_items') then
    -- Colonnes facultatives (peuvent ne pas exister sur certains environnements)
    begin
      alter table public.invoice_items add column if not exists reference text;
      exception when others then null;
    end;
    begin
      alter table public.invoice_items add column if not exists tax_rate numeric(10,2);
      exception when others then null;
    end;
    begin
      alter table public.invoice_items add column if not exists is_ht boolean;
      exception when others then null;
    end;
    -- Indexs conditionnels
    if exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' and table_name = 'invoice_items' and column_name = 'reference'
    ) then
      create index if not exists idx_invoice_items_reference
        on public.invoice_items (reference);
    end if;
    if exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' and table_name = 'invoice_items' and column_name = 'description'
    ) then
      create index if not exists idx_invoice_items_description_trgm
        on public.invoice_items using gin (description gin_trgm_ops);
    end if;
  end if;
end $$;


