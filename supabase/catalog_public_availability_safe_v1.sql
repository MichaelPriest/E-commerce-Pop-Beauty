-- Public, privacy-preserving availability for non-adult active products.
-- Same single-SKU and valid-lot criteria used by preview_checkout_cart.
-- Does NOT return stock quantities, batch IDs, prices, or adult products.
create or replace function public.catalog_product_availability(p_product_ids uuid[])
returns table(product_id uuid,active_variant_count integer,can_add_to_cart boolean,status text)
language plpgsql security definer set search_path=''
as $$
declare
 v_product uuid;
 v_variant uuid;
 v_count integer;
 v_stock bigint;
 v_lots bigint;
 v_today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if p_product_ids is null or coalesce(array_length(p_product_ids,1),0) not between 1 and 24 then
  raise exception 'Consulte entre 1 e 24 produtos' using errcode='22023';
 end if;
 for v_product in
  select distinct p.id from public.products p
  where p.id=any(p_product_ids) and p.active and not p.is_adult
 loop
  select count(*)::integer,min(v.id::text)::uuid
  into v_count,v_variant
  from public.variants v where v.product_id=v_product and v.active;
  product_id:=v_product;
  active_variant_count:=v_count;
  can_add_to_cart:=false;
  status:='unavailable';
  if v_count>1 then
   status:='variant_selection_required';
  elsif v_count=1 then
   select greatest(0,coalesce(i.on_hand,0)-coalesce(i.reserved,0))
   into v_stock from public.inventory i where i.variant_id=v_variant;
   select coalesce(sum(l.on_hand),0) into v_lots
   from public.inventory_lots l where l.variant_id=v_variant and l.on_hand>0
    and (l.expires_at is null or l.expires_at>=v_today);
   can_add_to_cart:=coalesce(least(v_stock,v_lots),0)>0;
   status:=case when can_add_to_cart then 'ready' else 'out_of_stock' end;
  end if;
  return next;
 end loop;
end;
$$;
revoke all on function public.catalog_product_availability(uuid[]) from public,anon,authenticated;
grant execute on function public.catalog_product_availability(uuid[]) to anon,authenticated;
comment on function public.catalog_product_availability(uuid[]) is
 'Somente status de disponibilidade de produtos ativos não adultos; sem revelar estoque, lotes, preços ou identificação de clientes.';
