-- Table des codes TVA par organisation
create table if not exists public.organization_vat_codes (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid references public.organizations(id) on delete cascade not null,
  code text not null,
  label text not null,
  rate numeric not null,
  synonyms text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_org_vat_code on public.organization_vat_codes(organization_id, code);
create index if not exists idx_org_vat_org on public.organization_vat_codes(organization_id);

alter table public.organization_vat_codes enable row level security;

-- Policies (compat Postgres): drop puis create
drop policy if exists "org members select vat" on public.organization_vat_codes;
create policy "org members select vat" on public.organization_vat_codes
for select using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = organization_id and m.user_id = auth.uid()
  )
);

drop policy if exists "org members insert vat" on public.organization_vat_codes;
create policy "org members insert vat" on public.organization_vat_codes
for insert with check (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = organization_id and m.user_id = auth.uid()
  )
);

drop policy if exists "org members update vat" on public.organization_vat_codes;
create policy "org members update vat" on public.organization_vat_codes
for update using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = organization_id and m.user_id = auth.uid()
  )
);

drop policy if exists "org members delete vat" on public.organization_vat_codes;
create policy "org members delete vat" on public.organization_vat_codes
for delete using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = organization_id and m.user_id = auth.uid()
  )
);

-- Trigger updated_at
create or replace function public.handle_updated_at_org_vat()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;$$ language plpgsql;

drop trigger if exists trg_updated_at_org_vat on public.organization_vat_codes;
create trigger trg_updated_at_org_vat
  before update on public.organization_vat_codes
  for each row execute procedure public.handle_updated_at_org_vat();

-- Codes TVA par organisation
create table if not exists public.organization_vat_codes (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid references public.organizations(id) on delete cascade not null,
  code text not null,
  label text not null,
  rate numeric not null,
  synonyms text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_org_vat_code on public.organization_vat_codes(organization_id, code);
create index if not exists idx_org_vat_org on public.organization_vat_codes(organization_id);

alter table public.organization_vat_codes enable row level security;

-- RLS policies
drop policy if exists "org members select vat" on public.organization_vat_codes;
create policy "org members select vat" on public.organization_vat_codes
for select using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = organization_id and m.user_id = auth.uid()
  )
);

drop policy if exists "org members insert vat" on public.organization_vat_codes;
create policy "org members insert vat" on public.organization_vat_codes
for insert with check (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = organization_id and m.user_id = auth.uid()
  )
);

drop policy if exists "org members update vat" on public.organization_vat_codes;
create policy "org members update vat" on public.organization_vat_codes
for update using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = organization_id and m.user_id = auth.uid()
  )
);

drop policy if exists "org members delete vat" on public.organization_vat_codes;
create policy "org members delete vat" on public.organization_vat_codes
for delete using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = organization_id and m.user_id = auth.uid()
  )
);

-- trigger updated_at
create or replace function public.handle_updated_at_org_vat()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;$$ language plpgsql;

drop trigger if exists trg_updated_at_org_vat on public.organization_vat_codes;
create trigger trg_updated_at_org_vat
  before update on public.organization_vat_codes
  for each row execute procedure public.handle_updated_at_org_vat();


