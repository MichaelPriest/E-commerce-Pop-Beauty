-- Apply after checkout_delivery_rates_v1.sql and payment_gateway_evaluation.sql.
begin;

create table public.commercial_payment_checkouts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  provider text not null references public.payment_gateway_settings(provider),
  seller_id text not null check (seller_id ~ '^[1-9][0-9]{0,19}$'),
  amount_cents integer not null check (amount_cents>0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  preference_id text,
  checkout_url text,
  check (expires_at>created_at),
  check ((preference_id is null)=(checkout_url is null)),
  unique (provider,preference_id)
);
create index commercial_checkouts_order_idx on public.commercial_payment_checkouts(order_id,created_at desc);
create index commercial_checkouts_creator_idx on public.commercial_payment_checkouts(created_by);

create table public.commercial_provider_payments (
  provider text not null,
  payment_id text not null check (payment_id ~ '^[0-9]{1,24}$'),
  checkout_id uuid not null references public.commercial_payment_checkouts(id) on delete restrict,
  status text not null,
  currency text not null,
  amount_cents integer not null check (amount_cents>=0),
  refunded_cents integer not null check (refunded_cents>=0 and refunded_cents<=amount_cents),
  provider_updated_at timestamptz not null,
  approved_at timestamptz,
  confirmed_at timestamptz,
  result text not null check (result in ('awaiting','not_paid','confirmed','value_mismatch',
    'late_approval','closed_order','duplicate_payment','provider_review')),
  observed_at timestamptz not null default clock_timestamp(),
  primary key (provider,payment_id)
);
create index commercial_provider_payments_checkout_idx on public.commercial_provider_payments(checkout_id);
create index commercial_provider_payments_review_idx on public.commercial_provider_payments(observed_at desc)
  where result in ('value_mismatch','late_approval','closed_order','duplicate_payment','provider_review');

alter table public.commercial_payment_checkouts enable row level security;
alter table public.commercial_provider_payments enable row level security;
revoke all on public.commercial_payment_checkouts,public.commercial_provider_payments from public,anon,authenticated;
grant select on public.commercial_payment_checkouts,public.commercial_provider_payments to authenticated;
grant select,insert,update on public.commercial_payment_checkouts,public.commercial_provider_payments to service_role;
create policy commercial_checkouts_admin_read on public.commercial_payment_checkouts
  for select to authenticated using ((select private.is_admin()));
create policy commercial_payments_admin_read on public.commercial_provider_payments
  for select to authenticated using ((select private.is_admin()));

create function public.begin_commercial_order_payment(p_order_id uuid,p_seller_id text,p_actor_id uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare
  v_order public.orders%rowtype;
  v_checkout public.commercial_payment_checkouts%rowtype;
  v_items jsonb;
  v_subtotal bigint;
  v_now timestamptz;
begin
  if not exists(select 1 from public.profiles where id=p_actor_id and role='admin') then
    raise exception 'Usuário sem acesso ao link de pagamento' using errcode='42501';
  end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.origin<>'admin_manual' or v_order.status<>'pending' then
    raise exception 'Pedido interno pendente não encontrado';
  end if;
  if exists (
    select 1 from public.commercial_payment_checkouts c
    join public.commercial_provider_payments p on p.checkout_id=c.id
    where c.order_id=p_order_id and p.result<>'not_paid'
  ) then raise exception 'Consulte os pagamentos deste pedido antes de gerar outro link'; end if;

  v_now := clock_timestamp();
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
    values (p_order_id,'mercado_pago',p_seller_id,v_order.total_cents,p_actor_id,v_now,v_now+interval '30 minutes')
    returning * into v_checkout;
  return jsonb_build_object('id',v_checkout.id,'expires_at',v_checkout.expires_at,
    'amount_cents',v_checkout.amount_cents,'delivery_fee_cents',v_order.checkout_delivery_fee_cents,
    'items',v_items,'create',true);
end;
$$;

create function public.finish_commercial_order_payment(p_checkout_id uuid,p_preference_id text,p_checkout_url text)
returns boolean language plpgsql security invoker set search_path=''
as $$
declare v_order public.orders%rowtype;
begin
  if p_preference_id is null or p_preference_id !~ '^[a-zA-Z0-9_-]{10,180}$'
    or p_checkout_url is null or length(p_checkout_url)>2000
    or p_checkout_url !~ '^https://(www[.])?mercadopago[.]com([.]br)?/' then
    raise exception 'O provedor retornou um link inválido';
  end if;
  select o.* into v_order from public.orders o
    join public.commercial_payment_checkouts c on c.order_id=o.id
    where c.id=p_checkout_id for update of o;
  if not found or v_order.origin<>'admin_manual' or v_order.status<>'pending' then
    raise exception 'O pedido encerrou antes da geração do link';
  end if;
  update public.commercial_payment_checkouts
    set preference_id=p_preference_id,checkout_url=p_checkout_url
    where id=p_checkout_id and preference_id is null and expires_at>clock_timestamp()
      and amount_cents=v_order.total_cents;
  if not found then raise exception 'A preparação do link encerrou ou o total mudou'; end if;
  return true;
end;
$$;

create function public.reconcile_commercial_order_payment(
  p_checkout_id uuid,p_seller_id text,p_payment_id text,p_status text,p_currency text,
  p_amount_cents integer,p_refunded_cents integer,p_provider_updated_at timestamptz,
  p_approved_at timestamptz,p_expected_order_id uuid default null
) returns text language plpgsql security invoker set search_path=''
as $$
declare
  v_checkout public.commercial_payment_checkouts%rowtype;
  v_order public.orders%rowtype;
  v_previous public.commercial_provider_payments%rowtype;
  v_result text;
  v_confirmation timestamptz;
begin
  select * into v_checkout from public.commercial_payment_checkouts where id=p_checkout_id;
  if not found or v_checkout.provider<>'mercado_pago' or v_checkout.seller_id is distinct from p_seller_id
      or (p_expected_order_id is not null and v_checkout.order_id<>p_expected_order_id) then
    return 'unmatched';
  end if;
  -- One lock covers checkout generation, order transitions and approvals for this order.
  select * into strict v_order from public.orders where id=v_checkout.order_id for update;
  select * into strict v_checkout from public.commercial_payment_checkouts where id=p_checkout_id;
  select * into v_previous from public.commercial_provider_payments
    where provider=v_checkout.provider and payment_id=p_payment_id for update;
  if found then
    if v_previous.checkout_id<>p_checkout_id then return 'unmatched'; end if;
    if p_provider_updated_at<=v_previous.provider_updated_at then return v_previous.result; end if;
  end if;

  v_confirmation := v_previous.confirmed_at;
  if p_currency<>'BRL' or p_amount_cents<>v_checkout.amount_cents then
    v_result := 'value_mismatch';
  elsif v_confirmation is not null then
    v_result := case when p_status='approved' and p_refunded_cents=0
      then 'confirmed' else 'provider_review' end;
  elsif p_status in ('pending','in_process','authorized') then
    v_result := 'awaiting';
  elsif p_status in ('rejected','cancelled') or (p_status='refunded' and p_refunded_cents=p_amount_cents) then
    v_result := 'not_paid';
  elsif p_status<>'approved' or p_refunded_cents<>0 or p_approved_at is null then
    v_result := 'provider_review';
  elsif exists (
    select 1 from public.commercial_provider_payments p
    join public.commercial_payment_checkouts c on c.id=p.checkout_id
    where c.order_id=v_order.id and p.confirmed_at is not null
  ) then
    v_result := 'duplicate_payment';
  elsif v_order.origin<>'admin_manual' or v_order.status<>'pending' or v_checkout.preference_id is null then
    v_result := 'closed_order';
  elsif p_approved_at<v_checkout.created_at or p_approved_at>v_checkout.expires_at
      or p_approved_at>p_provider_updated_at then
    v_result := 'late_approval';
  elsif v_order.total_cents<>v_checkout.amount_cents then
    v_result := 'value_mismatch';
  else
    v_result := 'confirmed';
    v_confirmation := clock_timestamp();
  end if;

  insert into public.commercial_provider_payments as existing
    (provider,payment_id,checkout_id,status,currency,amount_cents,refunded_cents,
      provider_updated_at,approved_at,confirmed_at,result)
    values (v_checkout.provider,p_payment_id,p_checkout_id,p_status,p_currency,p_amount_cents,
      p_refunded_cents,p_provider_updated_at,p_approved_at,v_confirmation,v_result)
  on conflict (provider,payment_id) do update set status=excluded.status,currency=excluded.currency,
    amount_cents=excluded.amount_cents,refunded_cents=excluded.refunded_cents,
    provider_updated_at=excluded.provider_updated_at,approved_at=excluded.approved_at,
    confirmed_at=excluded.confirmed_at,result=excluded.result,observed_at=clock_timestamp()
    where existing.checkout_id=excluded.checkout_id and existing.provider_updated_at<excluded.provider_updated_at;
  if not found then return 'unmatched'; end if;

  if v_result='confirmed' and v_previous.confirmed_at is null then
    update public.orders set status='paid',payment_reference='Mercado Pago #'||p_payment_id,
      updated_at=clock_timestamp() where id=v_order.id;
    insert into public.order_events(order_id,event_type,note,actor_id)
      values (v_order.id,'payment_confirmed','Pagamento aprovado e conferido no Mercado Pago #'||p_payment_id,null);
  end if;
  return v_result;
end;
$$;

revoke all on function public.begin_commercial_order_payment(uuid,text,uuid),
  public.finish_commercial_order_payment(uuid,text,text),
  public.reconcile_commercial_order_payment(uuid,text,text,text,text,integer,integer,timestamptz,timestamptz,uuid)
  from public,anon,authenticated;
grant execute on function public.begin_commercial_order_payment(uuid,text,uuid),
  public.finish_commercial_order_payment(uuid,text,text),
  public.reconcile_commercial_order_payment(uuid,text,text,text,text,integer,integer,timestamptz,timestamptz,uuid)
  to service_role;

create function private.guard_order_payment_transition()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if old.origin<>'admin_manual' or new.status=old.status then return new; end if;
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
create trigger guard_order_payment_transition before update of status on public.orders
  for each row execute function private.guard_order_payment_transition();

notify pgrst, 'reload schema';
commit;
