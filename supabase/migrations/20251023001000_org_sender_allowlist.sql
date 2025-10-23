-- Allowlist des expéditeurs par organisation
create table if not exists public.organization_sender_allowlist (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sender_email text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, sender_email)
);

alter table public.organization_sender_allowlist enable row level security;

-- Policies: lecture/écriture réservées aux membres de l'organisation
create policy org_sender_allowlist_select on public.organization_sender_allowlist
  for select using (public.is_org_member(organization_id));

create policy org_sender_allowlist_insert on public.organization_sender_allowlist
  for insert with check (public.is_org_member(organization_id));

create policy org_sender_allowlist_update on public.organization_sender_allowlist
  for update using (public.is_org_member(organization_id));

create policy org_sender_allowlist_delete on public.organization_sender_allowlist
  for delete using (public.is_org_member(organization_id));

comment on table public.organization_sender_allowlist is 'Liste blanche des expéditeurs autorisés par organisation pour l’inbound';

