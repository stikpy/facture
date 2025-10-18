-- Suppliers
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  display_name text not null,
  normalized_key text unique not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_suppliers_normalized_key on suppliers(normalized_key);

-- Link invoices -> suppliers
alter table if exists invoices add column if not exists supplier_id uuid references suppliers(id);
create index if not exists idx_invoices_supplier_id on invoices(supplier_id);

-- RLS
alter table suppliers enable row level security;
create policy "read suppliers" on suppliers for select using (true);
create policy "write suppliers admin only" on suppliers for all using (false) with check (false);
