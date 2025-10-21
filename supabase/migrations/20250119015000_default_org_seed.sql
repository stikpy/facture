-- Seed a single default organization and attach all users
-- Safe to run multiple times (uses ON CONFLICT DO NOTHING)

-- 1) Ensure public.users contains all auth users
insert into public.users (id, email, full_name)
select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', u.email)
from auth.users u
on conflict (id) do nothing;

-- 2) Create default organization (once)
with upsert_org as (
  insert into public.organizations (name)
  values ('Default Org')
  on conflict do nothing
  returning id
), org as (
  select id from upsert_org
  union all
  select id from public.organizations where name = 'Default Org' limit 1
)
-- 3) Add every user as member (member role)
insert into public.organization_members (organization_id, user_id, role)
select org.id, u.id, 'member'
from org, public.users u
on conflict do nothing;

-- 4) Push organization_id in auth.users metadata (helps frontend upload)
update auth.users au
set raw_user_meta_data = coalesce(au.raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('organization_id', (select id from public.organizations where name = 'Default Org' limit 1));

-- 5) Set invoices.organization_id to Default Org when null
update public.invoices i
set organization_id = (select id from public.organizations where name = 'Default Org' limit 1)
where i.organization_id is null;


