
-- Popê Beauty: gerenciamento transacional de catálogo e estoque
alter table public.products
  add column if not exists cost_cents integer not null default 0 check (cost_cents >= 0);

create table if not exists public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.variants(id) on delete cascade,
  lot_code text not null check (length(btrim(lot_code)) between 1 and 60),
  expires_at date,
  on_hand integer not null default 0 check (on_hand >= 0),
  created_at timestamptz not null default now(),
  unique(variant_id, lot_code)
);
create index if not exists idx_inventory_lots_variant on public.inventory_lots(variant_id);
create index if not exists idx_inventory_lots_expiring on public.inventory_lots(expires_at) where on_hand>0;
alter table public.stock_movements
  add column if not exists lot_id uuid references public.inventory_lots(id) on delete set null;

alter table public.inventory_lots enable row level security;
create policy "inventory_lots_staff_read" on public.inventory_lots for select to authenticated
  using ((select private.is_staff()));
create policy "inventory_lots_admin_insert" on public.inventory_lots for insert to authenticated
  with check ((select private.is_admin()));
create policy "inventory_lots_admin_update" on public.inventory_lots for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
grant select,insert,update on public.inventory_lots to authenticated;

-- Apenas imagens públicas dos produtos; upload estritamente administrativo.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy "pope_images_admin_upload" on storage.objects for insert to authenticated
  with check (bucket_id='product-images' and (select private.is_admin()));
create policy "pope_images_admin_read" on storage.objects for select to authenticated
  using (bucket_id='product-images' and (select private.is_staff()));
create policy "pope_images_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id='product-images' and (select private.is_admin()));

create or replace function public.adjust_stock(
  p_variant_id uuid, p_delta integer, p_reason text,
  p_lot_code text default 'SEM-LOTE', p_expires_at date default null
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  v_old integer;
  v_reserved integer;
  v_next integer;
  v_lot_id uuid;
  v_lot_stock integer;
  v_lot_expiry date;
  v_code text := coalesce(nullif(btrim(p_lot_code),''),'SEM-LOTE');
begin
  if not private.is_admin() then
    raise exception 'Somente administrador pode movimentar estoque' using errcode='42501';
  end if;
  if p_delta is null or p_delta=0 or abs(p_delta)>100000 then
    raise exception 'Quantidade inválida: use ajuste diferente de zero e até 100000 unidades';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 or length(p_reason)>180 then
    raise exception 'Informe um motivo para a movimentação';
  end if;
  if length(v_code)>60 then raise exception 'Código do lote muito longo'; end if;
  select i.on_hand,i.reserved into v_old,v_reserved
    from public.inventory i where i.variant_id=p_variant_id for update;
  if not found then raise exception 'SKU não possui registro de estoque'; end if;
  v_next := v_old + p_delta;
  if v_next < v_reserved or v_next<0 then
    raise exception 'Saldo insuficiente (saldo atual: %, reservado: %)',v_old,v_reserved;
  end if;

  select id,on_hand,expires_at into v_lot_id,v_lot_stock,v_lot_expiry
    from public.inventory_lots
   where variant_id=p_variant_id and lot_code=v_code for update;
  if not found then
    if p_delta < 0 then raise exception 'Lote % não possui saldo',v_code; end if;
    insert into public.inventory_lots(variant_id,lot_code,expires_at,on_hand)
      values(p_variant_id,v_code,p_expires_at,p_delta)
      returning id,on_hand into v_lot_id,v_lot_stock;
  else
    if v_lot_stock + p_delta < 0 then raise exception 'Saldo insuficiente no lote %',v_code; end if;
    if v_lot_expiry is not null and p_expires_at is not null and v_lot_expiry<>p_expires_at then
      raise exception 'Data de validade diverge do lote existente';
    end if;
    update public.inventory_lots set
      on_hand=on_hand+p_delta,
      expires_at=coalesce(expires_at,p_expires_at)
    where id=v_lot_id returning on_hand into v_lot_stock;
  end if;
  update public.inventory set on_hand=v_next,updated_at=now() where variant_id=p_variant_id;
  insert into public.stock_movements(variant_id,delta,reason,lot_id)
   values(p_variant_id,p_delta,btrim(p_reason),v_lot_id);
  return jsonb_build_object('variant_id',p_variant_id,'on_hand',v_next,'reserved',v_reserved,
    'lot_code',v_code,'lot_on_hand',v_lot_stock);
end;
$$;
revoke all on function public.adjust_stock(uuid,integer,text,text,date) from public,anon;
grant execute on function public.adjust_stock(uuid,integer,text,text,date) to authenticated;

create or replace function public.create_product_with_variant(
  p_name text, p_slug text, p_category_id uuid,
  p_description text, p_brand text,
  p_price_cents integer, p_cost_cents integer, p_compare_at_cents integer,
  p_image_url text, p_sku text, p_variant_name text, p_shade text, p_ean text,
  p_safety_stock integer, p_initial_stock integer, p_lot_code text, p_expires_at date,
  p_active boolean default false
) returns uuid language plpgsql security invoker set search_path = ''
as $$
declare v_product uuid; v_variant uuid;
begin
  if not private.is_admin() then raise exception 'Acesso restrito ao administrador' using errcode='42501'; end if;
  if p_name is null or length(btrim(p_name)) not between 2 and 150 then raise exception 'Nome inválido'; end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug)>160 then raise exception 'Slug inválido'; end if;
  if p_sku is null or length(btrim(p_sku)) not between 2 and 80 then raise exception 'SKU inválido'; end if;
  if p_price_cents is null or p_price_cents<0 or p_cost_cents is null or p_cost_cents<0 or
     (p_compare_at_cents is not null and p_compare_at_cents<0) then raise exception 'Preços inválidos'; end if;
  if p_initial_stock is null or p_initial_stock<0 or p_initial_stock>100000 or
     p_safety_stock is null or p_safety_stock<0 then raise exception 'Estoque inválido'; end if;
  insert into public.products(category_id,slug,name,description,brand,price_cents,cost_cents,
    compare_at_cents,image_url,active)
  values(p_category_id,p_slug,btrim(p_name),coalesce(p_description,''),coalesce(nullif(btrim(p_brand),''),'Popê Beauty'),
    p_price_cents,p_cost_cents,p_compare_at_cents,nullif(btrim(coalesce(p_image_url,'')),''),coalesce(p_active,false))
  returning id into v_product;
  insert into public.variants(product_id,sku,name,shade,ean)
  values(v_product,btrim(p_sku),coalesce(nullif(btrim(p_variant_name),''),'Padrão'),
    nullif(btrim(coalesce(p_shade,'')),''),nullif(btrim(coalesce(p_ean,'')),'')) returning id into v_variant;
  insert into public.inventory(variant_id,safety_stock) values(v_variant,p_safety_stock);
  if p_initial_stock>0 then
    perform public.adjust_stock(v_variant,p_initial_stock,'Estoque inicial',p_lot_code,p_expires_at);
  end if;
  return v_product;
end;
$$;
revoke all on function public.create_product_with_variant(text,text,uuid,text,text,integer,integer,integer,text,text,text,text,text,integer,integer,text,date,boolean)
  from public,anon;
grant execute on function public.create_product_with_variant(text,text,uuid,text,text,integer,integer,integer,text,text,text,text,text,integer,integer,text,date,boolean)
  to authenticated;

create or replace function public.add_product_variant(
 p_product_id uuid,p_sku text,p_name text,p_shade text,p_ean text,
 p_safety_stock integer default 0
) returns uuid language plpgsql security invoker set search_path = ''
as $$
declare v_id uuid;
begin
 if not private.is_admin() then raise exception 'Acesso restrito' using errcode='42501'; end if;
 if p_sku is null or length(btrim(p_sku)) not between 2 and 80 then raise exception 'SKU inválido'; end if;
 if p_safety_stock is null or p_safety_stock<0 then raise exception 'Estoque de segurança inválido'; end if;
 insert into public.variants(product_id,sku,name,shade,ean)
 values(p_product_id,btrim(p_sku),coalesce(nullif(btrim(p_name),''),'Padrão'),
 nullif(btrim(coalesce(p_shade,'')),''),nullif(btrim(coalesce(p_ean,'')),'')) returning id into v_id;
 insert into public.inventory(variant_id,safety_stock) values(v_id,p_safety_stock);
 return v_id;
end;
$$;
revoke all on function public.add_product_variant(uuid,text,text,text,text,integer) from public,anon;
grant execute on function public.add_product_variant(uuid,text,text,text,text,integer) to authenticated;
