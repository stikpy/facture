-- Index/contrainte pour éviter les doublons à l'import
-- Hypothèse: une facture est unique pour un utilisateur par (supplier + invoice_number) ou à défaut par hash de fichier

-- 1) Colonne optionnelle pour un hash de contenu (peut être remplie côté upload)
alter table if exists public.invoices add column if not exists file_hash text;
create index if not exists idx_invoices_file_hash on public.invoices(file_hash);

-- 2) Index partiel de déduplication par numéro de facture (si présent)
create unique index if not exists uniq_invoice_per_user_number
on public.invoices (user_id, (extracted_data->>'invoice_number'))
where extracted_data ? 'invoice_number' and (extracted_data->>'invoice_number') is not null and (extracted_data->>'invoice_number') <> '';

-- 3) Index unique de secours par (user_id, file_hash) si file_hash est fourni
create unique index if not exists uniq_invoice_per_user_filehash
on public.invoices (user_id, file_hash)
where file_hash is not null and file_hash <> '';


