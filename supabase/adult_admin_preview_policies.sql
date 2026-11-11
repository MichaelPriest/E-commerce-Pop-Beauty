-- Popê Beauty: visualizar catálogo reservado somente como administrador no painel.
-- Não altera idade verificada, não libera checkout e não afeta contas clientes.
-- Corrige bypass anterior: role staff não pode consultar produtos adultos.
drop policy if exists "categories_public_read" on public.categories;
create policy "categories_public_read" on public.categories for select to anon,authenticated
 using (
  (active and (not is_adult or (select private.can_view_adult())))
  or (not is_adult and (select private.is_staff()))
  or (select private.is_admin())
 );

drop policy if exists "products_catalog_read" on public.products;
create policy "products_catalog_read" on public.products for select to anon,authenticated
 using (
  (active and (not is_adult or (select private.can_view_adult())))
  or (not is_adult and (select private.is_staff()))
  or (select private.is_admin())
 );

drop policy if exists "variants_catalog_read" on public.variants;
create policy "variants_catalog_read" on public.variants for select to anon,authenticated
 using (
  (active and exists(
   select 1 from public.products p where p.id=product_id and p.active
     and (not p.is_adult or (select private.can_view_adult()))
  ))
  or (
   (select private.is_staff()) and
   exists(select 1 from public.products p where p.id=product_id and not p.is_adult)
  )
  or (select private.is_admin())
 );
