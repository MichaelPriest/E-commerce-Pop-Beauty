-- Disponibilidade das VARIAÇÕES na vitrine, sem quantidades privadas e sem itens +18.
create or replace function public.catalog_variant_availability(p_product_ids uuid[])
returns table(
 product_id uuid,variant_id uuid,sku text,name text,shade text,
 available boolean
)
language plpgsql security definer set search_path=''
as $$
declare v_day date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if p_product_ids is null
  or coalesce(array_length(p_product_ids,1),0) not between 1 and 24
 then raise exception 'Consulte entre 1 e 24 produtos' using errcode='22023';end if;
 return query
 select p.id,v.id,v.sku,v.name,v.shade,
  (coalesce(least(i.on_hand::bigint-i.reserved::bigint,
   coalesce(l.valid_lots,0)-coalesce(i.reserved,0)),0)>=1) as available
 from public.variants v
 join public.products p on p.id=v.product_id
 left join public.inventory i on i.variant_id=v.id
 left join lateral (
  select sum(il.on_hand)::bigint as valid_lots from public.inventory_lots il
  where il.variant_id=v.id and il.on_hand>0 and
   (il.expires_at is null or il.expires_at>=v_day)
 ) l on true
 where p.id=any(p_product_ids) and p.active and not p.is_adult and v.active
 order by p.id,v.name,v.id;
end;
$$;
revoke all on function public.catalog_variant_availability(uuid[])
 from public,anon,authenticated;
grant execute on function public.catalog_variant_availability(uuid[])
 to anon,authenticated;
comment on function public.catalog_variant_availability(uuid[]) is
 'Status booleano por variação ativa em produto público; sem saldo, lote, custo ou itens adultos.';
