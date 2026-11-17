-- Apply after checkout_variant_resolution_guard_v2.sql.
-- Delivery rules and order totals for the existing administrative checkout test.
begin;

create table public.checkout_delivery_rates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name=btrim(name) and length(name) between 2 and 80),
  cep_start text not null check (cep_start ~ '^[0-9]{8}$'),
  cep_end text not null check (cep_end ~ '^[0-9]{8}$' and cep_end>=cep_start),
  price_cents integer not null check (price_cents>=0),
  delivery_days smallint not null check (delivery_days>=0),
  active boolean not null default true,
  revision uuid not null default gen_random_uuid()
);

alter table public.checkout_delivery_rates enable row level security;
revoke all on public.checkout_delivery_rates from public,anon,authenticated;
grant select on public.checkout_delivery_rates to authenticated;
grant insert(name,cep_start,cep_end,price_cents,delivery_days,active),
      update(name,cep_start,cep_end,price_cents,delivery_days,active)
  on public.checkout_delivery_rates to authenticated;
create policy checkout_delivery_admin_read on public.checkout_delivery_rates
  for select to authenticated using ((select private.is_admin()));
create policy checkout_delivery_admin_insert on public.checkout_delivery_rates
  for insert to authenticated with check ((select private.is_admin()));
create policy checkout_delivery_admin_update on public.checkout_delivery_rates
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create index checkout_delivery_active_range_idx
  on public.checkout_delivery_rates(cep_start,cep_end) where active;

create function private.revise_checkout_delivery_rate()
returns trigger language plpgsql set search_path=''
as $$
begin
  new.revision := gen_random_uuid();
  return new;
end;
$$;
revoke all on function private.revise_checkout_delivery_rate() from public,anon,authenticated;
create trigger revise_checkout_delivery_rate before update on public.checkout_delivery_rates
  for each row execute function private.revise_checkout_delivery_rate();

alter table public.orders
  add column checkout_delivery_fee_cents integer not null default 0 check (checkout_delivery_fee_cents>=0),
  add column checkout_delivery_snapshot jsonb check (
    (checkout_delivery_snapshot is null and checkout_delivery_fee_cents=0)
    or jsonb_typeof(checkout_delivery_snapshot)='object'
  );

create function public.list_checkout_delivery_options(p_address_id uuid)
returns table(id uuid,name text,price_cents integer,delivery_days smallint,
              revision uuid,address_version timestamptz)
language sql stable security invoker set search_path=''
as $$
  select r.id,r.name,r.price_cents,r.delivery_days,r.revision,a.updated_at
  from public.customer_addresses a
  join public.checkout_delivery_rates r on r.active and a.postal_code between r.cep_start and r.cep_end
  where a.id=p_address_id and a.user_id=(select auth.uid()) and a.archived_at is null
    and (select private.is_admin())
  order by r.price_cents,r.delivery_days,r.name,r.id
$$;

create function private.create_checkout_delivery_order(
  p_address_id uuid,p_address_version timestamptz,p_rate_id uuid,p_rate_revision uuid,
  p_items jsonb,p_request_key uuid
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_address public.customer_addresses%rowtype;
  v_rate public.checkout_delivery_rates%rowtype;
  v_order public.orders%rowtype;
  v_id uuid;
  v_item_hash text;
  v_total bigint;
begin
  if v_user is null or not private.is_admin() then
    raise exception 'O checkout com entrega está em homologação administrativa' using errcode='42501';
  end if;
  if p_request_key is null or p_address_id is null or p_rate_id is null
      or p_address_version is null or p_rate_revision is null
      or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Informe o endereço, a entrega e os itens do pedido';
  end if;
  if jsonb_array_length(p_items) not between 1 and 10 then
    raise exception 'O pedido de teste exige entre 1 e 10 itens';
  end if;

  select md5(jsonb_build_array(
    p_address_id,extract(epoch from p_address_version),p_rate_id,p_rate_revision,
    jsonb_agg(e.value order by e.value->>'product_id',e.value->>'variant_id')
  )::text) into v_item_hash from jsonb_array_elements(p_items) e;

  -- Reuse the lock shared by the existing checkout, cancellation and expiry.
  perform pg_advisory_xact_lock(hashtext('pope-checkout-serialization'));
  select * into v_order from public.orders
    where customer_id=v_user and origin='store_api' and checkout_key=p_request_key
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

    v_id := private.create_checkout_order(p_address_id,p_items,p_request_key);
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
    if v_total>5000000 then raise exception 'O total com frete excede o limite do pedido de teste'; end if;

    update public.orders set
      checkout_delivery_fee_cents=v_rate.price_cents,
      total_cents=v_total::integer,
      checkout_delivery_snapshot=jsonb_build_object(
        'rate_id',v_rate.id,'name',v_rate.name,'delivery_days',v_rate.delivery_days,
        'postal_code',v_address.postal_code,'request_hash',v_item_hash
      )
    where id=v_id returning * into v_order;
    update public.order_events
      set note='Reserva de homologação criada com tarifa de entrega calculada.'
      where order_id=v_id and event_type='created';
  end if;

  return jsonb_build_object(
    'order_id',v_order.id,'status',v_order.status,'expires_at',v_order.reservation_expires_at,
    'subtotal_cents',v_order.total_cents-v_order.checkout_delivery_fee_cents,
    'delivery_fee_cents',v_order.checkout_delivery_fee_cents,'total_cents',v_order.total_cents,
    'delivery_name',v_order.checkout_delivery_snapshot->>'name'
  );
end;
$$;

create function public.create_checkout_delivery_order(
  p_address_id uuid,p_address_version timestamptz,p_rate_id uuid,p_rate_revision uuid,
  p_items jsonb,p_request_key uuid
) returns jsonb
language sql security invoker set search_path=''
as $$
  select private.create_checkout_delivery_order(
    p_address_id,p_address_version,p_rate_id,p_rate_revision,p_items,p_request_key
  )
$$;
revoke all on function public.list_checkout_delivery_options(uuid),
  private.create_checkout_delivery_order(uuid,timestamptz,uuid,uuid,jsonb,uuid),
  public.create_checkout_delivery_order(uuid,timestamptz,uuid,uuid,jsonb,uuid)
  from public,anon,authenticated;
grant execute on function public.list_checkout_delivery_options(uuid),
  private.create_checkout_delivery_order(uuid,timestamptz,uuid,uuid,jsonb,uuid),
  public.create_checkout_delivery_order(uuid,timestamptz,uuid,uuid,jsonb,uuid)
  to authenticated;

notify pgrst, 'reload schema';
commit;
