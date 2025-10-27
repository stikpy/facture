-- Add document type and pairing fields to invoices
alter table public.invoices
  add column if not exists document_type text check (document_type in ('invoice', 'delivery_note', 'credit_note', 'quote', 'other')) default 'invoice';

alter table public.invoices
  add column if not exists document_reference text;

alter table public.invoices
  add column if not exists paired_document_id uuid references public.invoices(id) on delete set null;

create index if not exists idx_invoices_document_type on public.invoices(document_type);
create index if not exists idx_invoices_document_reference on public.invoices(document_reference);
