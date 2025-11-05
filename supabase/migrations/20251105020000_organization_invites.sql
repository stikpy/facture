-- Table des invitations d'organisation
create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  max_uses int not null default 1,
  used_count int not null default 0,
  is_active boolean not null default true
);

create index if not exists idx_org_invites_org on public.organization_invites(organization_id);
create index if not exists idx_org_invites_code on public.organization_invites(code);

-- RLS: membres de l'organisation peuvent lister/créer/voir leurs invitations
alter table public.organization_invites enable row level security;

drop policy if exists org_invites_select on public.organization_invites;
create policy org_invites_select on public.organization_invites
  for select using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = organization_invites.organization_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists org_invites_insert on public.organization_invites;
create policy org_invites_insert on public.organization_invites
  for insert with check (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = organization_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin')
    )
  );

drop policy if exists org_invites_update on public.organization_invites;
create policy org_invites_update on public.organization_invites
  for update using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = organization_invites.organization_id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin')
    )
  );


