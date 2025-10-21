-- Table d'alias fournisseurs pour dédupliquer les variantes créées par l'IA
create table if not exists supplier_aliases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id) on delete cascade,
  alias_key text not null, -- normalized_key de la variante
  created_at timestamptz not null default now(),
  unique (supplier_id, alias_key)
);

create index if not exists idx_supplier_aliases_key on supplier_aliases(alias_key);

alter table supplier_aliases enable row level security;
create policy "read supplier_aliases" on supplier_aliases for select using (true);
create policy "write supplier_aliases admin only" on supplier_aliases for all using (false) with check (false);


