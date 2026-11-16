-- Garantir que várias variações não selecionadas não caiam na primeira por acidente.
-- Proteger prévia de duplicata de variação implícita e explícita.
CREATE OR REPLACE FUNCTION private.preview_checkout_cart(p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_entry jsonb;
 v_id_text text;
 v_variant_text text;
 v_quantity_text text;
 v_qty integer;
 v_seen text[]:=array[]::text[];
 v_seen_resolved uuid[]:=array[]::uuid[];
 v_p record;
 v_variant_count integer;
 v_variant uuid;
 v_variant_name text;
 v_key text;
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
  v_variant_text:=btrim(coalesce(v_entry->>'variant_id',''));
  if v_variant_text<>'' and v_variant_text !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then raise exception 'Identificador de variação inválido';end if;
  v_quantity_text:=coalesce(v_entry->>'quantity','');
  if length(v_id_text) not between 1 and 80 then
   raise exception 'Identificador do produto inválido';
  end if;
  if jsonb_typeof(v_entry->'quantity')<>'number'
   or v_quantity_text !~ '^[1-9][0-9]?$' then
   raise exception 'Quantidade inválida: utilize de 1 a 99 unidades';
  end if;
  v_qty:=v_quantity_text::integer;
  v_key:=v_id_text||':'||coalesce(nullif(v_variant_text,''),'automatic');
  if v_key=any(v_seen) then
   raise exception 'A mesma variação aparece duas vezes: ajuste a quantidade';
  end if;
  v_seen:=array_append(v_seen,v_key);
  v_variant:=null;
  v_variant_name:=null;
  v_line_status:='unavailable';
  v_line_cents:=0;
  if v_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   select id,slug,name,price_cents into v_p
   from public.products
   where id=v_id_text::uuid and active=true and is_adult=false;
   if found and v_p.price_cents>0 then
    v_line_cents:=v_p.price_cents::bigint*v_qty;
    select count(*)::integer into v_variant_count
    from public.variants where product_id=v_p.id and active=true;
    if v_variant_text<>'' then
     select v.id,v.name into v_variant,v_variant_name
     from public.variants v where v.product_id=v_p.id
      and v.id=v_variant_text::uuid and v.active;
     if not found then
      v_variant:=null;
      v_line_status:='unavailable';
     end if;
    elsif v_variant_count=1 then
     select v.id,v.name into v_variant,v_variant_name
      from public.variants v where v.product_id=v_p.id and v.active;
    elsif v_variant_count>1 then
     v_line_status:='variant_selection_required';
    end if;
    if v_variant is not null then
     if v_variant=any(v_seen_resolved) then
      raise exception 'Variação duplicada: ajuste a quantidade';
     end if;
     v_seen_resolved:=array_append(v_seen_resolved,v_variant);
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
    end if;
   end if;
  end if;
  if v_line_status<>'ready' then v_ready:=false;end if;
  v_subtotal:=v_subtotal+v_line_cents;
  if v_subtotal>100000000 then raise exception 'O valor do carrinho excede o limite de prévia';end if;
  if v_line_status='unavailable' then
   v_lines:=v_lines||jsonb_build_array(jsonb_build_object(
    'product_id',v_id_text,'name','Produto indisponível',
    'slug',null,'variant_id',null,'variant_name',null,
    'quantity',v_qty,'unit_price_cents',null,
    'line_total_cents',null,'status',v_line_status));
  else
   v_lines:=v_lines||jsonb_build_array(jsonb_build_object(
    'product_id',v_id_text,'name',v_p.name,'slug',v_p.slug,
    'variant_id',v_variant,'variant_name',v_variant_name,
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
$function$
;
