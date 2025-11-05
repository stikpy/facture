-- Enforce non-empty account_code on invoice_allocations for future rows
-- We use a CHECK NOT VALID to avoid scanning existing data; it will be applied to new/updated rows

alter table if exists public.invoice_allocations
  add constraint invoice_allocations_account_code_present
  check (account_code is not null and btrim(account_code) <> '') not valid;


