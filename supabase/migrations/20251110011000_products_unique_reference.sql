-- Unicité produit: par organisation, fournisseur et référence
-- Empêche les doublons au niveau base

create unique index if not exists uq_products_org_supplier_reference
  on public.products (organization_id, supplier_id, reference);



