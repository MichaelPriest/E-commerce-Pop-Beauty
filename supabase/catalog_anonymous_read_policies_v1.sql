-- Apply after adult_admin_preview_policies.sql and product_gallery_variant_binding_v1.sql,
-- before deploying the panel that calls admin_catalog_costs.
-- The visitor policies use public rows only. The authenticated policies
-- continue to govern staff access and access to the reserved catalog.
begin;

alter policy categories_public_read on public.categories to authenticated;
create policy categories_anon_read on public.categories
  for select to anon using (active and not is_adult);

alter policy products_catalog_read on public.products to authenticated;
create policy products_anon_read on public.products
  for select to anon using (active and not is_adult);

alter policy variants_catalog_read on public.variants to authenticated;
create policy variants_anon_read on public.variants
  for select to anon using (
    active and exists (
      select 1 from public.products p
      where p.id=variants.product_id and p.active and not p.is_adult
    )
  );

alter policy gallery_public_read on public.product_gallery_images to authenticated;
create policy gallery_anon_read on public.product_gallery_images
  for select to anon using (
    exists (
      select 1 from public.products p
      where p.id=product_gallery_images.product_id and p.active and not p.is_adult
    )
  );

revoke select on public.products from public,anon;
revoke select (cost_cents) on public.products from public,anon;
grant select (id,category_id,slug,name,description,brand,price_cents,compare_at_cents,
  image_url,active,created_at,is_adult) on public.products to anon;

revoke select on public.product_gallery_images from public,anon,authenticated;
revoke select (created_by) on public.product_gallery_images from public,anon,authenticated;
grant select (id,product_id,storage_path,alt_text,sort_order,created_at,variant_id)
  on public.product_gallery_images to anon,authenticated;

create function private.admin_catalog_costs(p_product_ids uuid[])
returns table(product_id uuid,cost_cents integer)
language plpgsql stable security definer set search_path=''
as $$
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Somente administradores podem consultar custos' using errcode='42501';
  end if;
  if cardinality(p_product_ids)>1000 then
    raise exception 'Consulte até mil produtos por vez';
  end if;
  return query select p.id,p.cost_cents from public.products p where p.id=any(p_product_ids);
end;
$$;

create function public.admin_catalog_costs(p_product_ids uuid[])
returns table(product_id uuid,cost_cents integer)
language sql stable security invoker set search_path=''
as $$ select * from private.admin_catalog_costs(p_product_ids) $$;

revoke all on function private.admin_catalog_costs(uuid[]),public.admin_catalog_costs(uuid[])
  from public,anon,authenticated;
grant execute on function private.admin_catalog_costs(uuid[]),public.admin_catalog_costs(uuid[])
  to authenticated;

notify pgrst, 'reload schema';
commit;
