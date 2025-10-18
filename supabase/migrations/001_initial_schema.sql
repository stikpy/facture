-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- Create users table (extends auth.users)
create table public.users (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text not null,
  company_name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create invoices table
create table public.invoices (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  file_name text not null,
  file_path text not null,
  file_size bigint not null,
  mime_type text not null,
  extracted_data jsonb,
  classification text,
  status text default 'pending' check (status in ('pending', 'processing', 'completed', 'error')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create invoice_items table
create table public.invoice_items (
  id uuid default uuid_generate_v4() primary key,
  invoice_id uuid references public.invoices(id) on delete cascade not null,
  description text not null,
  quantity numeric(10,2) not null,
  unit_price numeric(10,2) not null,
  total_price numeric(10,2) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table public.users enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

-- Create policies for users table
create policy "Users can view own profile" on public.users
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.users
  for update using (auth.uid() = id);

create policy "Users can insert own profile" on public.users
  for insert with check (auth.uid() = id);

-- Create policies for invoices table
create policy "Users can view own invoices" on public.invoices
  for select using (auth.uid() = user_id);

create policy "Users can insert own invoices" on public.invoices
  for insert with check (auth.uid() = user_id);

create policy "Users can update own invoices" on public.invoices
  for update using (auth.uid() = user_id);

create policy "Users can delete own invoices" on public.invoices
  for delete using (auth.uid() = user_id);

-- Create policies for invoice_items table
create policy "Users can view invoice items for own invoices" on public.invoice_items
  for select using (
    exists (
      select 1 from public.invoices 
      where invoices.id = invoice_items.invoice_id 
      and invoices.user_id = auth.uid()
    )
  );

create policy "Users can insert invoice items for own invoices" on public.invoice_items
  for insert with check (
    exists (
      select 1 from public.invoices 
      where invoices.id = invoice_items.invoice_id 
      and invoices.user_id = auth.uid()
    )
  );

create policy "Users can update invoice items for own invoices" on public.invoice_items
  for update using (
    exists (
      select 1 from public.invoices 
      where invoices.id = invoice_items.invoice_id 
      and invoices.user_id = auth.uid()
    )
  );

create policy "Users can delete invoice items for own invoices" on public.invoice_items
  for delete using (
    exists (
      select 1 from public.invoices 
      where invoices.id = invoice_items.invoice_id 
      and invoices.user_id = auth.uid()
    )
  );

-- Create indexes for better performance
create index idx_invoices_user_id on public.invoices(user_id);
create index idx_invoices_status on public.invoices(status);
create index idx_invoices_created_at on public.invoices(created_at);
create index idx_invoice_items_invoice_id on public.invoice_items(invoice_id);

-- Create function to automatically create user profile
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

-- Create trigger for new user creation
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Create function to update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

-- Create triggers for updated_at
create trigger handle_updated_at_users
  before update on public.users
  for each row execute procedure public.handle_updated_at();

create trigger handle_updated_at_invoices
  before update on public.invoices
  for each row execute procedure public.handle_updated_at();
