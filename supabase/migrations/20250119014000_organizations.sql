-- Organizations and memberships
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- Link invoices to organizations
alter table if exists public.invoices add column if not exists organization_id uuid references public.organizations(id);
create index if not exists idx_invoices_organization_id on public.invoices(organization_id);

-- Helper function to check membership
create or replace function public.is_org_member(org uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

-- Update RLS policies on invoices to organization-based
do $$ begin
  if exists (select 1 from pg_policies where schemaname='public' and tablename='invoices' and policyname='Users can view own invoices') then
    drop policy "Users can view own invoices" on public.invoices;
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='invoices' and policyname='Users can insert own invoices') then
    drop policy "Users can insert own invoices" on public.invoices;
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='invoices' and policyname='Users can update own invoices') then
    drop policy "Users can update own invoices" on public.invoices;
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='invoices' and policyname='Users can delete own invoices') then
    drop policy "Users can delete own invoices" on public.invoices;
  end if;
end $$;

create policy invoices_select_by_org on public.invoices
  for select using (
    organization_id is not null and public.is_org_member(organization_id)
  );

create policy invoices_insert_by_org on public.invoices
  for insert with check (
    organization_id is not null and public.is_org_member(organization_id)
  );

create policy invoices_update_by_org on public.invoices
  for update using (
    organization_id is not null and public.is_org_member(organization_id)
  );

create policy invoices_delete_by_org on public.invoices
  for delete using (
    organization_id is not null and public.is_org_member(organization_id)
  );

-- Storage: make bucket private and enforce org-level access by path
update storage.buckets set public=false where id='invoices';

-- Helper in public schema (no need to write in storage schema)
create or replace function public.org_id_from_object_name(object_name text)
returns uuid language sql immutable as $$
  select nullif(split_part(object_name, '/', 1), '')::uuid;
$$;

create policy storage_invoices_select_by_org on storage.objects
  for select using (
    bucket_id='invoices' and public.is_org_member(public.org_id_from_object_name(name))
  );

create policy storage_invoices_insert_by_org on storage.objects
  for insert with check (
    bucket_id='invoices' and public.is_org_member(public.org_id_from_object_name(name))
  );

create policy storage_invoices_update_by_org on storage.objects
  for update using (
    bucket_id='invoices' and public.is_org_member(public.org_id_from_object_name(name))
  );

create policy storage_invoices_delete_by_org on storage.objects
  for delete using (
    bucket_id='invoices' and public.is_org_member(public.org_id_from_object_name(name))
  );


