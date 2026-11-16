-- Permite variante explicitamente selecionada em prévia e reserva de HOMOLOGAÇÃO.
-- Mantém pedidos reais DESATIVADOS, valida dados exclusivamente no PostgreSQL.
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
    select count(*)::integer,min(id::text)::uuid into v_variant_count,v_variant
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
      from public.variants v where v.id=v_variant and v.active;
    elsif v_variant_count>1 then
     v_line_status:='variant_selection_required';
    end if;
    if v_variant is not null then
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
CREATE OR REPLACE FUNCTION private.create_checkout_order(p_address_id uuid, p_items jsonb, p_request_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid;v_email_confirmed timestamptz;v_address record;v_order_id uuid;
v_item record;v_product record;v_stock record;v_variant uuid;v_count integer;
v_seen_variants uuid[]:=array[]::uuid[];
v_qty integer;v_total bigint:=0;v_lots bigint;v_available bigint;v_items_count integer;
v_expiry timestamptz:=now()+interval '15 minutes';
begin
 v_uid:=auth.uid();
 if v_uid is null or (auth.jwt()->>'is_anonymous')='true' then
  raise exception 'Entre na sua conta para preparar o pedido' using errcode='42501';end if;
 if p_request_key is null or p_address_id is null then raise exception 'Endereço e identificador de requisição são obrigatórios';end if;
 perform pg_advisory_xact_lock(hashtext('pope-checkout-serialization'));
 perform private.expire_checkout_orders(100);
 select id into v_order_id from public.orders
  where customer_id=v_uid and origin='store_api' and checkout_key=p_request_key;
 if found then return v_order_id;end if;
 if not private.is_admin() and not coalesce((select checkout_reservations_enabled
    from public.store_settings where id=1),false) then
  raise exception 'Reservas de checkout estão disponíveis somente em homologação';end if;
 select email_confirmed_at into v_email_confirmed from auth.users where id=v_uid;
 if v_email_confirmed is null then raise exception 'Confirme seu e-mail para reservar um pedido';end if;
 select * into v_address from public.customer_addresses
  where id=p_address_id and user_id=v_uid and archived_at is null;
 if not found then raise exception 'Selecione um endereço da sua conta';end if;
 if exists(select 1 from public.orders
   where customer_id=v_uid and origin='store_api' and status='pending') then
  raise exception 'Já existe uma reserva de teste ativa. Aguarde o vencimento ou cancele a anterior';end if;
 if (select count(*) from public.orders where customer_id=v_uid
    and origin='store_api' and created_at>now()-interval '24 hours')>=5 then
  raise exception 'Limite de cinco reservas de teste por 24 horas';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 10 then
  raise exception 'O pedido de teste exige entre 1 e 10 produtos';end if;
 if exists(select 1 from (
  select (e->>'product_id')||':'||coalesce(e->>'variant_id','default') as k
   from jsonb_array_elements(p_items) e group by 1 having count(*)>1
 ) d) then raise exception 'Remova produtos duplicados do carrinho';end if;
 v_items_count:=0;
 -- Calcula subtotal somente com preços no banco, sem confiar no preço do navegador.
 insert into public.orders(customer_id,channel,origin,status,total_cents,checkout_key,
  reservation_expires_at,shipping_address_snapshot)
 values(v_uid,'store','store_api','pending',0,p_request_key,v_expiry,
  jsonb_build_object('recipient',v_address.recipient,'phone',v_address.phone,
    'postal_code',v_address.postal_code,'street',v_address.street,
    'house_number',v_address.house_number,'complement',v_address.complement,
    'district',v_address.district,'city',v_address.city,'state_code',v_address.state_code))
 returning id into v_order_id;
 for v_item in select e->>'product_id' as product_id,
  e->>'variant_id' as variant_id,e->>'quantity' as quantity_text
  from jsonb_array_elements(p_items) e order by 1,2
 loop
  if v_item.product_id is null or
    v_item.product_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or v_item.quantity_text is null or v_item.quantity_text !~ '^[1-9][0-9]?$'
    then raise exception 'Produto ou quantidade inválidos';end if;
  v_qty:=v_item.quantity_text::integer;
  v_items_count:=v_items_count+v_qty;
  if v_items_count>30 then raise exception 'Limite de 30 unidades por reserva';end if;
  select p.id,p.name,p.slug,p.price_cents into v_product from public.products p
   where p.id=v_item.product_id::uuid and p.active and not p.is_adult and p.price_cents>0;
  if not found then raise exception 'Produto não disponível para reserva';end if;
  if nullif(btrim(coalesce(v_item.variant_id,'')),'') is not null then
   if v_item.variant_id !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   then raise exception 'ID de variação inválido';end if;
   select v.id into v_variant from public.variants v
    where v.product_id=v_product.id and v.id=v_item.variant_id::uuid and v.active;
   if not found then raise exception 'Variação não pertence ao produto';end if;
  else
   select count(*)::integer,min(v.id::text)::uuid into v_count,v_variant
    from public.variants v where v.product_id=v_product.id and v.active;
   if v_count<>1 then raise exception 'É necessário escolher uma variação disponível';end if;
  end if;
  if v_variant=any(v_seen_variants) then
   raise exception 'Variação duplicada na reserva';end if;
  v_seen_variants:=array_append(v_seen_variants,v_variant);
  select i.on_hand,i.reserved,v.sku into v_stock from public.inventory i
   join public.variants v on v.id=i.variant_id
   where i.variant_id=v_variant for update of i;
  if not found then raise exception 'Estoque não disponível para o produto';end if;
  select coalesce(sum(l.on_hand),0)::bigint into v_lots
   from public.inventory_lots l
   where l.variant_id=v_variant and l.on_hand>0
    and (l.expires_at is null or l.expires_at>=(now() at time zone 'America/Sao_Paulo')::date);
  v_available:=least(v_stock.on_hand-v_stock.reserved,v_lots-v_stock.reserved);
  if v_available<v_qty then raise exception 'Estoque disponível insuficiente para o item';end if;
  v_total:=v_total+v_product.price_cents::bigint*v_qty;
  if v_total>5000000 then raise exception 'Limite do pedido de teste excedido';end if;
  insert into public.order_items(order_id,variant_id,sku_snapshot,title_snapshot,quantity,unit_price_cents)
   values(v_order_id,v_variant,v_stock.sku,v_product.name,v_qty,v_product.price_cents);
  update public.inventory set reserved=reserved+v_qty,updated_at=now()
   where variant_id=v_variant;
 end loop;
 update public.orders set total_cents=v_total::integer,updated_at=now()
  where id=v_order_id;
 insert into public.order_events(order_id,event_type,note,actor_id)
 values(v_order_id,'created','Reserva de homologação criada; sem frete e sem cobrança.',v_uid);
 return v_order_id;
end;
$function$
;
