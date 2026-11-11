-- Prévia de checkout: valida catálogo e lotes. Nunca cria pedido, reserva ou cobrança.
-- Anon e clientes recebem apenas nomes/preços públicos de produtos não adultos.
create or replace function private.preview_checkout_cart(p_items jsonb)
 returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_entry jsonb;
 v_id_text text;
 v_quantity_text text;
 v_qty integer;
 v_seen text[]:=array[]::text[];
 v_p record;
 v_variant_count integer;
 v_variant uuid;
 v_stock record;
 v_valid_lots bigint;
 v_available bigint;
 v_line_status text;
 v_lines jsonb:='[]'::jsonb;
 v_ready boolean:=true;
 v_subtotal bigint:=0;
 v_line_cents bigint;
 v_brazil_date date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if p_items is null or jsonb_typeof(p_items)<>'array'
    or jsonb_array_length(p_items) not between 1 and 30 then
  raise exception 'Informe de 1 a 30 itens para revisar o carrinho';
 end if;
 for v_entry in select value from jsonb_array_elements(p_items) as t(value)
 loop
  if jsonb_typeof(v_entry)<>'object' then
   raise exception 'Formato de item inválido';
  end if;
  v_id_text:=btrim(coalesce(v_entry->>'product_id',''));
  v_quantity_text:=coalesce(v_entry->>'quantity','');
  if length(v_id_text) not between 1 and 80 then
   raise exception 'Identificador do produto inválido';
  end if;
  if jsonb_typeof(v_entry->'quantity')<>'number'
   or v_quantity_text !~ '^[1-9][0-9]?$' then
   raise exception 'Quantidade inválida: utilize de 1 a 99 unidades';
  end if;
  v_qty:=v_quantity_text::integer;
  if v_id_text=any(v_seen) then
   raise exception 'O mesmo produto aparece duas vezes: ajuste a quantidade';
  end if;
  v_seen:=array_append(v_seen,v_id_text);
  v_line_status:='unavailable';
  v_line_cents:=0;
  if v_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   select id,slug,name,price_cents into v_p
   from public.products
   where id=v_id_text::uuid and active=true and is_adult=false;
   if found and v_p.price_cents>0 then
    v_line_cents:=v_p.price_cents::bigint*v_qty;
    select count(*)::integer,min(id) into v_variant_count,v_variant
    from public.variants where product_id=v_p.id and active=true;
    if v_variant_count=1 then
     select i.on_hand,i.reserved into v_stock
     from public.inventory i where i.variant_id=v_variant;
     if found then
      select coalesce(sum(l.on_hand),0)::bigint into v_valid_lots
      from public.inventory_lots l
      where l.variant_id=v_variant and l.on_hand>0
        and (l.expires_at is null or l.expires_at>=v_brazil_date);
      v_available:=greatest(0,least(
       v_stock.on_hand::bigint-v_stock.reserved,
       v_valid_lots-v_stock.reserved));
      v_line_status:=case when v_available>=v_qty then 'ready' else 'out_of_stock' end;
     else
      v_line_status:='out_of_stock';
     end if;
    elsif v_variant_count>1 then
     v_line_status:='variant_selection_required';
    else
     v_line_status:='unavailable';
    end if;
   end if;
  end if;
  if v_line_status<>'ready' then v_ready:=false;end if;
  v_subtotal:=v_subtotal+v_line_cents;
  if v_subtotal>100000000 then raise exception 'O valor do carrinho excede o limite de prévia';end if;
  if v_line_status='unavailable' then
   v_lines:=v_lines||jsonb_build_array(jsonb_build_object(
    'product_id',v_id_text,'name','Produto indisponível',
    'slug',null,'quantity',v_qty,'unit_price_cents',null,
    'line_total_cents',null,'status',v_line_status));
  else
   v_lines:=v_lines||jsonb_build_array(jsonb_build_object(
    'product_id',v_id_text,'name',v_p.name,'slug',v_p.slug,
    'quantity',v_qty,'unit_price_cents',v_p.price_cents,
    'line_total_cents',v_line_cents,'status',v_line_status));
  end if;
 end loop;
 return jsonb_build_object(
  'currency','BRL',
  'ready_for_future_checkout',v_ready,
  'lines',v_lines,
  'subtotal_cents',v_subtotal,
  'shipping_calculated',false,
  'payment_available',false,
  'stock_reserved',false,
  'preview_only',true,
  'checked_at',now()
 );
end;
$$;
-- Função privilegiada fora dos schemas publicados.
revoke all on function private.preview_checkout_cart(jsonb) from public;
grant execute on function private.preview_checkout_cart(jsonb) to anon,authenticated;

create or replace function public.preview_checkout_cart(p_items jsonb)
 returns jsonb language sql security invoker set search_path=''
as $$
 select private.preview_checkout_cart(p_items)
$$;
revoke all on function public.preview_checkout_cart(jsonb) from public;
grant execute on function public.preview_checkout_cart(jsonb) to anon,authenticated;

comment on function public.preview_checkout_cart(jsonb) is
 'Prévia de valores do catálogo, sem efeitos transacionais. Não gera pedidos nem autentica pagamentos.';
