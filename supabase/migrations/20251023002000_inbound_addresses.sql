-- Table pour mapper une adresse email complète vers une organisation
create table if not exists public.inbound_addresses (
  full_address text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.inbound_addresses enable row level security;

create policy inbound_addresses_select on public.inbound_addresses
  for select using (true);

-- Gestion par admins/app uniquement en écriture (simplifié)
create policy inbound_addresses_manage_deny on public.inbound_addresses
  for all using (false) with check (false);

create index if not exists idx_inbound_addresses_org on public.inbound_addresses(organization_id);

comment on table public.inbound_addresses is 'Mappe une adresse email complète (to) à une organization';

