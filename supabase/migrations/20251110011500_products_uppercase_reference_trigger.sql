-- Normalisation de la référence produit à l'écriture (UPPER + TRIM)
create or replace function public.normalize_product_reference()
returns trigger
language plpgsql
as $$
begin
  if new.reference is not null then
    new.reference := upper(trim(new.reference));
  end if;
  if new.name is not null then
    new.name := trim(new.name);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_products_normalize_reference on public.products;
create trigger trg_products_normalize_reference
before insert or update on public.products
for each row execute function public.normalize_product_reference();



