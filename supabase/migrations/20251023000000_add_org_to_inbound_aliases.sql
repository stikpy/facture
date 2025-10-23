-- Add organization_id to inbound_aliases to allow org-level routing
alter table if exists public.inbound_aliases
  add column if not exists organization_id uuid references public.organizations(id);

create index if not exists idx_inbound_aliases_org on public.inbound_aliases(organization_id);

comment on column public.inbound_aliases.organization_id is 'Optionally bind alias to an organization; route inbound to this org.';

-- Make user_id optional to allow org-scoped aliases without a dedicated user
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inbound_aliases' and column_name = 'user_id'
  ) then
    alter table public.inbound_aliases alter column user_id drop not null;
  end if;
end $$;

