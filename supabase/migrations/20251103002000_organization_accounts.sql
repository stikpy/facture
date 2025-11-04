-- Table des comptes comptables par organisation
create table if not exists public.organization_accounts (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid references public.organizations(id) on delete cascade not null,
  code text not null,
  label text not null,
  synonyms text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_org_accounts_code on public.organization_accounts(organization_id, code);
create index if not exists idx_org_accounts_org on public.organization_accounts(organization_id);

alter table public.organization_accounts enable row level security;

-- RLS: membres de l'organisation
drop policy if exists "org members select accounts" on public.organization_accounts;
create policy "org members select accounts" on public.organization_accounts
for select using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = organization_id and m.user_id = auth.uid()
  )
);

drop policy if exists "org members insert accounts" on public.organization_accounts;
create policy "org members insert accounts" on public.organization_accounts
for insert with check (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = organization_id and m.user_id = auth.uid()
  )
);

drop policy if exists "org members update accounts" on public.organization_accounts;
create policy "org members update accounts" on public.organization_accounts
for update using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = organization_id and m.user_id = auth.uid()
  )
);

drop policy if exists "org members delete accounts" on public.organization_accounts;
create policy "org members delete accounts" on public.organization_accounts
for delete using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = organization_id and m.user_id = auth.uid()
  )
);

-- trigger updated_at
create or replace function public.handle_updated_at_org_accounts()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;$$ language plpgsql;

drop trigger if exists trg_updated_at_org_accounts on public.organization_accounts;
create trigger trg_updated_at_org_accounts
  before update on public.organization_accounts
  for each row execute procedure public.handle_updated_at_org_accounts();


