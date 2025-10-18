create table if not exists inbound_aliases (
  alias text primary key, -- local-part avant @, ex: "gabriel" pour gabriel@gk-dev.tech
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table inbound_aliases enable row level security;
create policy "select aliases" on inbound_aliases for select using (true);
create policy "manage aliases admin only" on inbound_aliases for all using (false) with check (false);
