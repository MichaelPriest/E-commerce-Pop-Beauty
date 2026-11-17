-- Storefront orders reuse the operational order, inventory, payment and shipping pipeline.
-- Apply after commercial_order_payments_v1 and fiscal_document_readiness_v1.
begin;

grant usage on schema private to service_role;
alter table public.store_settings add column commercial_checkout_enabled boolean not null default false;
alter table public.orders add column storefront_order boolean not null default false
  check (not storefront_order or (origin='admin_manual' and checkout_key is not null and reservation_expires_at is not null));
create unique index storefront_order_retry_idx on public.orders(customer_id,checkout_key) where storefront_order;
create unique index storefront_order_pending_idx on public.orders(customer_id) where storefront_order and status='pending';
create index storefront_order_expiry_idx on public.orders(reservation_expires_at) where storefront_order and status='pending';

create table public.store_order_cancellations (
  order_id uuid primary key references public.orders(id) on delete cascade,
  state text not null default 'requested' check (state in ('requested','completed','dismissed')),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.store_order_cancellations enable row level security;
revoke all on public.store_order_cancellations from public,anon,authenticated;
grant select on public.store_order_cancellations to authenticated;
grant select,insert,update on public.store_order_cancellations to service_role;
create policy store_cancel_owner_or_admin on public.store_order_cancellations for select to authenticated
  using ((select private.is_admin()) or exists (
    select 1 from public.orders o where o.id=order_id and o.customer_id=(select auth.uid())
  ));

create function private.release_order_reservation(p_order_id uuid)
returns void language plpgsql set search_path=''
as $$
declare v_item record;
begin
  for v_item in select variant_id,sum(quantity)::integer quantity from public.order_items
    where order_id=p_order_id group by variant_id order by variant_id
  loop
    update public.inventory set reserved=reserved-v_item.quantity,updated_at=clock_timestamp()
      where variant_id=v_item.variant_id and reserved>=v_item.quantity;
    if not found then raise exception 'Reserva de estoque inconsistente para o pedido %',p_order_id; end if;
  end loop;
end;
$$;
revoke all on function private.release_order_reservation(uuid) from public,anon,authenticated;
grant execute on function private.release_order_reservation(uuid) to service_role;

create function private.reserve_checkout_order(p_address_id uuid,p_items jsonb,p_request_key uuid,p_user uuid,p_online boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid;v_email_confirmed timestamptz;v_address record;v_order_id uuid;
v_item record;v_product record;v_stock record;v_variant uuid;v_count integer;
v_seen_variants uuid[]:=array[]::uuid[];
v_qty integer;v_total bigint:=0;v_lots bigint;v_available bigint;v_items_count integer;
v_origin text:=case when p_online then 'admin_manual' else 'store_api' end;
v_expiry timestamptz:=now()+case when p_online then interval '40 minutes' else interval '15 minutes' end;
begin
 v_uid:=p_user;
 if v_uid is null or (not p_online and (auth.jwt()->>'is_anonymous')='true') then
  raise exception 'Entre na sua conta para preparar o pedido' using errcode='42501';end if;
 if p_request_key is null or p_address_id is null then raise exception 'Endereço e identificador de requisição são obrigatórios';end if;
 perform pg_advisory_xact_lock(hashtext('pope-checkout-serialization'));
 perform private.expire_checkout_orders(100);
 select id into v_order_id from public.orders
  where customer_id=v_uid and origin=v_origin and storefront_order=p_online and checkout_key=p_request_key;
 if found then return v_order_id;end if;
 if p_online and not coalesce((select commercial_checkout_enabled from public.store_settings where id=1),false) then
  raise exception 'Checkout comercial indisponível' using errcode='42501';
 elsif not p_online and not private.is_admin() and not coalesce((select checkout_reservations_enabled
    from public.store_settings where id=1),false) then
  raise exception 'Reservas de checkout estão disponíveis somente em homologação';end if;
 select email_confirmed_at into v_email_confirmed from auth.users where id=v_uid;
 if v_email_confirmed is null then raise exception 'Confirme seu e-mail para reservar um pedido';end if;
 select * into v_address from public.customer_addresses
  where id=p_address_id and user_id=v_uid and archived_at is null;
 if not found then raise exception 'Selecione um endereço da sua conta';end if;
 if exists(select 1 from public.orders
   where customer_id=v_uid and origin=v_origin and storefront_order=p_online and status='pending') then
  raise exception 'Há uma reserva ativa. Você pode continuar ou cancelar o pedido em Minha conta';end if;
 if (select count(*) from public.orders where customer_id=v_uid
    and origin=v_origin and storefront_order=p_online and created_at>now()-interval '24 hours')>=5 then
  raise exception 'Limite de cinco reservas por 24 horas';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array'
   or jsonb_array_length(p_items) not between 1 and (case when p_online then 30 else 10 end) then
  raise exception 'Quantidade de itens fora do limite do checkout';end if;
 if exists(select 1 from (
  select (e->>'product_id')||':'||coalesce(e->>'variant_id','default') as k
   from jsonb_array_elements(p_items) e group by 1 having count(*)>1
 ) d) then raise exception 'Remova produtos duplicados do carrinho';end if;
 v_items_count:=0;
 -- Calcula subtotal somente com preços no banco, sem confiar no preço do navegador.
 insert into public.orders(customer_id,channel,origin,status,total_cents,checkout_key,
  reservation_expires_at,storefront_order,shipping_address_snapshot)
 values(v_uid,'store',v_origin,'pending',0,p_request_key,v_expiry,p_online,
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
  if not p_online and v_items_count>30 then raise exception 'Limite de 30 unidades por reserva';end if;
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
  if v_total>(case when p_online then 100000000 else 5000000 end) then raise exception 'Limite do pedido excedido';end if;
  insert into public.order_items(order_id,variant_id,sku_snapshot,title_snapshot,quantity,unit_price_cents)
   values(v_order_id,v_variant,v_stock.sku,v_product.name,v_qty,v_product.price_cents);
  update public.inventory set reserved=reserved+v_qty,updated_at=now()
   where variant_id=v_variant;
 end loop;
 update public.orders set total_cents=v_total::integer,updated_at=now()
  where id=v_order_id;
 insert into public.order_events(order_id,event_type,note,actor_id)
 values(v_order_id,'created',case when p_online then 'Pedido da vitrine aguardando pagamento.'
   else 'Reserva de homologação criada; sem frete e sem cobrança.' end,v_uid);
 return v_order_id;
end;
$function$;
create function private.prepare_checkout_delivery_order(
  p_address_id uuid,p_address_version timestamptz,p_rate_id uuid,p_rate_revision uuid,
  p_items jsonb,p_request_key uuid,p_user uuid,p_tax_id text,p_full_name text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_user uuid := p_user;
  v_online boolean := p_tax_id is not null;
  v_origin text := case when v_online then 'admin_manual' else 'store_api' end;
  v_address public.customer_addresses%rowtype;
  v_rate public.checkout_delivery_rates%rowtype;
  v_order public.orders%rowtype;
  v_id uuid;
  v_item_hash text;
  v_total bigint;
begin
  if v_user is null then raise exception 'Entre na sua conta' using errcode='42501'; end if;
  if v_online and (p_tax_id !~ '^[0-9]{11}$' or length(coalesce(btrim(p_full_name),'')) not between 2 and 160) then
    raise exception 'Informe nome e CPF para a nota fiscal';
  end if;
  if p_request_key is null or p_address_id is null or p_rate_id is null
      or p_address_version is null or p_rate_revision is null
      or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Informe o endereço, a entrega e os itens do pedido';
  end if;
  if jsonb_array_length(p_items) not between 1 and (case when v_online then 30 else 10 end) then
    raise exception 'Quantidade de itens fora do limite do checkout';
  end if;

  select md5((jsonb_build_array(p_address_id,extract(epoch from p_address_version),p_rate_id,p_rate_revision)
    || case when v_online then jsonb_build_array(p_tax_id,btrim(p_full_name)) else '[]'::jsonb end
    || jsonb_build_array(jsonb_agg(e.value order by e.value->>'product_id',e.value->>'variant_id')))::text)
    into v_item_hash from jsonb_array_elements(p_items) e;

  -- Reuse the lock shared by the existing checkout, cancellation and expiry.
  perform pg_advisory_xact_lock(hashtext('pope-checkout-serialization'));
  select * into v_order from public.orders
    where customer_id=v_user and origin=v_origin and storefront_order=v_online and checkout_key=p_request_key
    for update;
  if found then
    if v_order.checkout_delivery_snapshot->>'request_hash' is distinct from v_item_hash then
      raise exception 'A confirmação anterior pertence a outro pedido. Revise o carrinho';
    end if;
    if v_order.status='pending' and v_order.reservation_expires_at<=now() then
      perform private.expire_checkout_orders(100);
      select * into v_order from public.orders where id=v_order.id;
    end if;
  else
    select * into v_address from public.customer_addresses
      where id=p_address_id and user_id=v_user and archived_at is null for share;
    if not found or v_address.updated_at is distinct from p_address_version then
      raise exception 'O endereço foi alterado ou está indisponível. Consulte a entrega novamente';
    end if;

    select * into v_rate from public.checkout_delivery_rates
      where id=p_rate_id and active and v_address.postal_code between cep_start and cep_end for share;
    if not found or v_rate.revision is distinct from p_rate_revision then
      raise exception 'As condições de entrega mudaram. Consulte as opções novamente';
    end if;

    v_id := private.reserve_checkout_order(p_address_id,p_items,p_request_key,v_user,v_online);
    if exists (
      select 1 from public.order_items oi
      left join jsonb_to_recordset(p_items) as expected(variant_id uuid,quantity integer,unit_price_cents integer)
        on expected.variant_id=oi.variant_id
      where oi.order_id=v_id and (expected.quantity is distinct from oi.quantity
        or expected.unit_price_cents is distinct from oi.unit_price_cents)
    ) then
      raise exception 'O preço dos itens mudou. Confira o carrinho novamente';
    end if;

    select o.total_cents::bigint+v_rate.price_cents into v_total from public.orders o where o.id=v_id;
    if v_total>(case when v_online then 100000000 else 5000000 end) then
      raise exception 'O total com frete excede o limite do pedido';
    end if;

    update public.orders set
      checkout_delivery_fee_cents=v_rate.price_cents,
      total_cents=v_total::integer,
      checkout_delivery_snapshot=jsonb_build_object(
        'rate_id',v_rate.id,'name',v_rate.name,'delivery_days',v_rate.delivery_days,
        'postal_code',v_address.postal_code,'request_hash',v_item_hash
      )
    where id=v_id returning * into v_order;
    if v_online then
      insert into public.fiscal_order_recipients(order_id,full_name,tax_id,updated_by)
        values(v_id,btrim(p_full_name),p_tax_id,v_user);
      insert into public.fiscal_order_drafts(order_id,fiscal_model,operation_nature,updated_by)
        values(v_id,'55','Venda de mercadoria',v_user);
    else
      update public.order_events
        set note='Reserva de homologação criada com tarifa de entrega calculada.'
        where order_id=v_id and event_type='created';
    end if;
  end if;

  return jsonb_build_object(
    'order_id',v_order.id,'status',v_order.status,'expires_at',v_order.reservation_expires_at,
    'subtotal_cents',v_order.total_cents-v_order.checkout_delivery_fee_cents,
    'delivery_fee_cents',v_order.checkout_delivery_fee_cents,'total_cents',v_order.total_cents,
    'delivery_name',v_order.checkout_delivery_snapshot->>'name'
  );
end;
$$;



revoke all on function private.reserve_checkout_order(uuid,jsonb,uuid,uuid,boolean),
  private.prepare_checkout_delivery_order(uuid,timestamptz,uuid,uuid,jsonb,uuid,uuid,text,text)
  from public,anon,authenticated;

create or replace function private.create_checkout_order(p_address_id uuid,p_items jsonb,p_request_key uuid)
returns uuid language sql security definer set search_path=''
as $$select private.reserve_checkout_order(p_address_id,p_items,p_request_key,auth.uid(),false)$$;

create or replace function private.create_checkout_delivery_order(
  p_address_id uuid,p_address_version timestamptz,p_rate_id uuid,p_rate_revision uuid,
  p_items jsonb,p_request_key uuid
) returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'O checkout de teste está em homologação administrativa' using errcode='42501';
  end if;
  return private.prepare_checkout_delivery_order(
    p_address_id,p_address_version,p_rate_id,p_rate_revision,p_items,p_request_key,auth.uid(),null,null);
end;
$$;

create function private.storefront_delivery_options(p_address_id uuid)
returns table(id uuid,name text,price_cents integer,delivery_days smallint,revision uuid,address_version timestamptz)
language sql stable security definer set search_path=''
as $$
  select r.id,r.name,r.price_cents,r.delivery_days,r.revision,a.updated_at
  from public.customer_addresses a
  join public.checkout_delivery_rates r on r.active and a.postal_code between r.cep_start and r.cep_end
  where a.id=p_address_id and a.user_id=(select auth.uid()) and a.archived_at is null
    and (auth.jwt()->>'is_anonymous') is distinct from 'true'
    and coalesce((select commercial_checkout_enabled from public.store_settings where id=1),false)
  order by r.price_cents,r.delivery_days,r.name,r.id
$$;
create function public.storefront_delivery_options(p_address_id uuid)
returns table(id uuid,name text,price_cents integer,delivery_days smallint,revision uuid,address_version timestamptz)
language sql stable security invoker set search_path=''
as $$select * from private.storefront_delivery_options(p_address_id)$$;
revoke all on function private.storefront_delivery_options(uuid), public.storefront_delivery_options(uuid) from public,anon,authenticated;
grant execute on function private.storefront_delivery_options(uuid), public.storefront_delivery_options(uuid) to authenticated;

create function private.create_storefront_order(
  p_address_id uuid,p_address_version timestamptz,p_rate_id uuid,p_rate_revision uuid,
  p_items jsonb,p_request_key uuid,p_user uuid,p_tax_id text,p_full_name text
) returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  if p_tax_id is null or not coalesce((select commercial_checkout_enabled from public.store_settings where id=1),false) then
    raise exception 'Checkout comercial indisponível' using errcode='42501';
  end if;
  return private.prepare_checkout_delivery_order(
    p_address_id,p_address_version,p_rate_id,p_rate_revision,p_items,p_request_key,p_user,p_tax_id,p_full_name);
end;
$$;
create function public.create_storefront_order(
  p_address_id uuid,p_address_version timestamptz,p_rate_id uuid,p_rate_revision uuid,
  p_items jsonb,p_request_key uuid,p_user uuid,p_tax_id text,p_full_name text
) returns jsonb language sql security invoker set search_path=''
as $$select private.create_storefront_order(
  p_address_id,p_address_version,p_rate_id,p_rate_revision,p_items,p_request_key,p_user,p_tax_id,p_full_name)$$;
revoke all on function private.create_storefront_order(uuid,timestamptz,uuid,uuid,jsonb,uuid,uuid,text,text),
  public.create_storefront_order(uuid,timestamptz,uuid,uuid,jsonb,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function private.create_storefront_order(uuid,timestamptz,uuid,uuid,jsonb,uuid,uuid,text,text),
  public.create_storefront_order(uuid,timestamptz,uuid,uuid,jsonb,uuid,uuid,text,text) to service_role;

create or replace function private.expire_checkout_orders(p_limit integer default 100)
 returns integer language plpgsql security definer set search_path=''
as $$
declare v_order record;v_count integer:=0;
begin
 perform pg_advisory_xact_lock(hashtext('pope-checkout-serialization'));
 for v_order in select o.id,o.storefront_order from public.orders o
  where (o.origin='store_api' or o.storefront_order) and o.status='pending'
    and o.reservation_expires_at<=clock_timestamp()
    and not exists (
      select 1 from public.commercial_payment_checkouts c
      join public.commercial_provider_payments p on p.checkout_id=c.id
      where c.order_id=o.id and p.result='awaiting'
    )
  order by reservation_expires_at,id
  for update skip locked limit greatest(1,least(coalesce(p_limit,100),200))
 loop
  perform private.release_order_reservation(v_order.id);
  update public.orders set status='cancelled',updated_at=now() where id=v_order.id;
  insert into public.order_events(order_id,event_type,note,actor_id)
    values(v_order.id,'cancelled',case when v_order.storefront_order then 'Reserva da vitrine expirada.'
      else 'Reserva de homologação expirada; nenhum pagamento realizado.' end,null);
  update public.store_order_cancellations set state='completed',updated_at=clock_timestamp()
    where order_id=v_order.id and state='requested';
  v_count:=v_count+1;
 end loop;
 return v_count;
end;
$$;
revoke all on function private.expire_checkout_orders(integer) from public,anon,authenticated;


create or replace function public.begin_commercial_order_payment(p_order_id uuid,p_seller_id text,p_actor_id uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare
  v_order public.orders%rowtype;
  v_checkout public.commercial_payment_checkouts%rowtype;
  v_items jsonb;
  v_subtotal bigint;
  v_now timestamptz;
  v_expires timestamptz;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.origin<>'admin_manual' or v_order.status<>'pending' then
    raise exception 'Pedido interno pendente não encontrado';
  end if;
  if not exists(select 1 from public.profiles where id=p_actor_id and role='admin')
     and not (v_order.storefront_order and v_order.customer_id is not distinct from p_actor_id
       and p_actor_id is not null
       and coalesce((select commercial_checkout_enabled from public.store_settings where id=1),false)) then
    raise exception 'Usuário sem acesso ao link de pagamento' using errcode='42501';
  end if;
  if exists (select 1 from public.store_order_cancellations where order_id=p_order_id and state='requested') then
    raise exception 'O pedido tem um cancelamento solicitado';
  end if;
  if exists (
    select 1 from public.commercial_payment_checkouts c
    join public.commercial_provider_payments p on p.checkout_id=c.id
    where c.order_id=p_order_id and p.result<>'not_paid'
  ) then raise exception 'Consulte os pagamentos deste pedido antes de gerar outro link'; end if;

  v_now := clock_timestamp();
  v_expires := v_now+interval '30 minutes';
  if v_order.storefront_order then
    v_expires := least(v_expires,v_order.reservation_expires_at-interval '5 minutes');
    if v_expires<=v_now+interval '1 minute' then raise exception 'Reserva perto do vencimento. Confira em Minha conta'; end if;
  end if;
  select * into v_checkout from public.commercial_payment_checkouts
    where order_id=p_order_id and expires_at>v_now order by created_at desc limit 1;
  if found then
    if v_checkout.amount_cents<>v_order.total_cents or v_checkout.seller_id<>p_seller_id then
      raise exception 'O link ativo pertence a outro total ou vendedor';
    end if;
    return jsonb_build_object('id',v_checkout.id,'checkout_url',v_checkout.checkout_url,
      'expires_at',v_checkout.expires_at,'create',false);
  end if;

  select jsonb_agg(jsonb_build_object('sku',i.sku_snapshot,'title',i.title_snapshot,
      'quantity',i.quantity,'priceCents',i.unit_price_cents) order by i.id),
    sum(i.quantity::bigint*i.unit_price_cents)
    into v_items,v_subtotal from public.order_items i where i.order_id=p_order_id;
  if v_subtotal is null or v_order.total_cents<=0
      or v_subtotal+v_order.checkout_delivery_fee_cents<>v_order.total_cents
      or exists (select 1 from public.order_items where order_id=p_order_id and unit_price_cents<=0) then
    raise exception 'O total do pedido diverge dos itens e da entrega ou contém itens sem preço';
  end if;

  insert into public.commercial_payment_checkouts
    (order_id,provider,seller_id,amount_cents,created_by,created_at,expires_at)
    values (p_order_id,'mercado_pago',p_seller_id,v_order.total_cents,p_actor_id,v_now,v_expires)
    returning * into v_checkout;
  return jsonb_build_object('id',v_checkout.id,'expires_at',v_checkout.expires_at,
    'amount_cents',v_checkout.amount_cents,'delivery_fee_cents',v_order.checkout_delivery_fee_cents,
    'items',v_items,'create',true);
end;
$$;


create or replace function private.guard_order_payment_transition()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if old.origin<>'admin_manual' or new.status=old.status then return new; end if;
  if new.status in ('packing','shipped') and exists (
    select 1 from public.store_order_cancellations where order_id=old.id and state='requested'
  ) then raise exception 'Confira a solicitação de cancelamento antes da expedição'; end if;
  if new.status in ('packing','shipped') and exists (
    select 1 from public.commercial_provider_payments p
    join public.commercial_payment_checkouts c on c.id=p.checkout_id
    where c.order_id=old.id and p.confirmed_at is not null and p.result<>'confirmed'
  ) then raise exception 'Confira o pagamento contestado ou estornado antes da expedição'; end if;

  if old.status='pending' and new.status in ('paid','cancelled') then
    if new.status='paid' and exists (
      select 1 from public.commercial_provider_payments p
      join public.commercial_payment_checkouts c on c.id=p.checkout_id
      where c.order_id=old.id and p.result='confirmed' and p.confirmed_at is not null
        and new.payment_reference='Mercado Pago #'||p.payment_id
    ) then return new; end if;
    if old.storefront_order and new.status='paid' then
      raise exception 'Aguarde a confirmação do provedor de pagamento';
    end if;
    if exists (select 1 from public.commercial_payment_checkouts
         where order_id=old.id and expires_at>clock_timestamp()) or exists (
      select 1 from public.commercial_provider_payments p
      join public.commercial_payment_checkouts c on c.id=p.checkout_id
      where c.order_id=old.id and (p.result='awaiting' or (new.status='paid' and p.result<>'not_paid'))
    ) then raise exception 'Há um link ativo ou um pagamento do provedor para conferir neste pedido'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_order_payment_transition() from public,anon,authenticated;

notify pgrst, 'reload schema';
commit;
