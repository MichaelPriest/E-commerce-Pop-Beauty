-- Apply after deploying the panel that reads costs through admin_catalog_costs.
-- Administrative writes keep their existing grants and row-level policies.
begin;

revoke select on public.products from public,authenticated;
revoke select (cost_cents) on public.products from public,authenticated;
grant select (id,category_id,slug,name,description,brand,price_cents,compare_at_cents,
  image_url,active,created_at,is_adult) on public.products to authenticated;

notify pgrst, 'reload schema';
commit;
