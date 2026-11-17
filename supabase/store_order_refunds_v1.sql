-- Apply after storefront_orders_v1.
begin;

create table public.store_order_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  payment_id text not null unique check (payment_id ~ '^[0-9]{1,24}$'),
  amount_cents integer not null check (amount_cents>=0),
  initial_refunded_cents integer not null check (initial_refunded_cents>=0),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  state text not null default 'requested' check (state in ('requested','confirmed')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index store_order_refunds_order_idx on public.store_order_refunds(order_id);
alter table public.store_order_refunds enable row level security;
revoke all on public.store_order_refunds from public,anon,authenticated;
grant select on public.store_order_refunds to authenticated;
grant select,insert,update on public.store_order_refunds to service_role;
create policy store_refunds_admin_read on public.store_order_refunds for select to authenticated
  using ((select private.is_admin()));

create function private.request_store_order_cancel(p_order_id uuid,p_reason text)
returns text language plpgsql security definer set search_path=''
as $$
declare v_order public.orders%rowtype; v_user uuid:=auth.uid();
begin
  if v_user is null or (auth.jwt()->>'is_anonymous')='true' then raise exception 'Entre na sua conta'; end if;
  if length(btrim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'Informe o motivo do cancelamento'; end if;
  select * into v_order from public.orders where id=p_order_id and origin='admin_manual'
    and (private.is_admin() or (storefront_order and customer_id=v_user)) for update;
  if not found then raise exception 'Pedido indisponível'; end if;
  if v_order.status in ('cancelled','refunded') then return 'completed'; end if;
  insert into public.store_order_cancellations(order_id,reason) values(p_order_id,btrim(p_reason))
    on conflict(order_id) do update set state='requested',reason=excluded.reason,updated_at=clock_timestamp()
      where store_order_cancellations.state='dismissed';

  if v_order.status='pending' and not exists (
    select 1 from public.commercial_payment_checkouts c where c.order_id=p_order_id and (
      c.expires_at>clock_timestamp() or exists (
        select 1 from public.commercial_provider_payments p where p.checkout_id=c.id and p.result='awaiting'
      )
    )
  ) then
    perform private.release_order_reservation(p_order_id);
    update public.orders set status='cancelled',updated_at=clock_timestamp() where id=p_order_id;
    update public.store_order_cancellations set state='completed',updated_at=clock_timestamp() where order_id=p_order_id;
    insert into public.order_events(order_id,event_type,note,actor_id)
      values(p_order_id,'cancelled','Pedido cancelado e reserva liberada.',v_user);
    return 'completed';
  end if;
  return 'requested';
end;
$$;

create function public.request_store_order_cancel(p_order_id uuid,p_reason text)
returns text language sql security invoker set search_path=''
as $$select private.request_store_order_cancel(p_order_id,p_reason)$$;
revoke all on function private.request_store_order_cancel(uuid,text),public.request_store_order_cancel(uuid,text)
  from public,anon,authenticated;
grant execute on function private.request_store_order_cancel(uuid,text),public.request_store_order_cancel(uuid,text) to authenticated;

create function private.dismiss_store_order_cancel(p_order_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not private.is_admin() then raise exception 'Acesso restrito ao administrador' using errcode='42501'; end if;
  perform 1 from public.orders where id=p_order_id for update;
  if exists (select 1 from public.store_order_refunds where order_id=p_order_id and state='requested') then
    raise exception 'Há um estorno em processamento';
  end if;
  update public.store_order_cancellations set state='dismissed',updated_at=clock_timestamp()
    where order_id=p_order_id and state='requested';
  return found;
end;
$$;
create function public.dismiss_store_order_cancel(p_order_id uuid)
returns boolean language sql security invoker set search_path=''
as $$select private.dismiss_store_order_cancel(p_order_id)$$;
revoke all on function private.dismiss_store_order_cancel(uuid),public.dismiss_store_order_cancel(uuid) from public,anon,authenticated;
grant execute on function private.dismiss_store_order_cancel(uuid),public.dismiss_store_order_cancel(uuid) to authenticated;

create function public.begin_store_order_refund(p_order_id uuid,p_payment_id text,p_reason text,p_seller_id text)
returns public.store_order_refunds language plpgsql security invoker set search_path=''
as $$
declare v_payment public.commercial_provider_payments%rowtype; v_refund public.store_order_refunds%rowtype;
begin
  if length(btrim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'Informe o motivo do estorno'; end if;
  perform 1 from public.orders where id=p_order_id and origin='admin_manual' for update;
  if not found then raise exception 'Pedido indisponível'; end if;
  select p.* into v_payment from public.commercial_provider_payments p
    join public.commercial_payment_checkouts c on c.id=p.checkout_id
    where c.order_id=p_order_id and c.provider='mercado_pago' and c.seller_id=p_seller_id and p.payment_id=p_payment_id
      and p.status in ('approved','refunded') and p.currency='BRL' and p.amount_cents>0;
  if not found then raise exception 'Pagamento do pedido indisponível para estorno'; end if;
  select * into v_refund from public.store_order_refunds where payment_id=p_payment_id;
  if found then return v_refund; end if;
  insert into public.store_order_refunds(order_id,payment_id,amount_cents,initial_refunded_cents,reason)
    values(p_order_id,p_payment_id,v_payment.amount_cents-v_payment.refunded_cents,v_payment.refunded_cents,btrim(p_reason))
    returning * into v_refund;
  if v_payment.confirmed_at is not null then
    insert into public.store_order_cancellations(order_id,reason) values(p_order_id,btrim(p_reason))
      on conflict(order_id) do update set state='requested',updated_at=clock_timestamp() where store_order_cancellations.state='dismissed';
  end if;
  return v_refund;
end;
$$;

create function public.finish_store_order_refund(p_order_id uuid,p_payment_id text)
returns text language plpgsql security invoker set search_path=''
as $$
declare v_order public.orders%rowtype; v_refund public.store_order_refunds%rowtype; v_payment public.commercial_provider_payments%rowtype;
begin
  select * into strict v_order from public.orders where id=p_order_id for update;
  select * into strict v_refund from public.store_order_refunds where order_id=p_order_id and payment_id=p_payment_id;
  if v_refund.state='confirmed' then return 'confirmed'; end if;
  select p.* into v_payment from public.commercial_provider_payments p
    join public.commercial_payment_checkouts c on c.id=p.checkout_id
    where c.order_id=p_order_id and c.provider='mercado_pago' and p.payment_id=p_payment_id
      and p.status='refunded' and p.refunded_cents=p.amount_cents;
  if not found then return 'requested'; end if;
  update public.store_order_refunds set state='confirmed',confirmed_at=clock_timestamp() where id=v_refund.id;

  if v_payment.confirmed_at is not null and v_order.status in ('paid','packing','shipped','delivered') then
    if v_order.status in ('paid','packing') and v_order.shipped_at is null then
      perform private.release_order_reservation(p_order_id);
    end if;
    update public.orders set status='refunded',updated_at=clock_timestamp() where id=p_order_id;
    update public.store_order_cancellations set state='completed',updated_at=clock_timestamp() where order_id=p_order_id;
    insert into public.order_events(order_id,event_type,note,actor_id)
      values(p_order_id,'note',case when v_order.shipped_at is null then 'Estorno total confirmado. Reserva liberada.'
        else 'Estorno total confirmado. Conferir a devolução física dos itens.' end,null);
  end if;
  return 'confirmed';
end;
$$;
revoke all on function public.begin_store_order_refund(uuid,text,text,text),public.finish_store_order_refund(uuid,text)
  from public,anon,authenticated;
grant execute on function public.begin_store_order_refund(uuid,text,text,text),public.finish_store_order_refund(uuid,text) to service_role;

notify pgrst, 'reload schema';
commit;
