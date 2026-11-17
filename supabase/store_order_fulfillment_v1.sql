-- Apply after storefront_orders_v1 and store_order_refunds_v1.
begin;

create table public.store_nfe_documents (
  order_id uuid not null references public.orders(id) on delete restrict,
  environment text not null check(environment in ('homologacao','producao')),
  reference uuid not null unique default gen_random_uuid(),
  status text not null check(status in ('submitting','processing','authorized','rejected','cancelling','cancelled')),
  invoice_key text check(invoice_key is null or invoice_key ~ '^[0-9]{44}$'),
  xml_path text, danfe_path text, cancellation_xml_path text,
  provider_message text,
  submitted_payload jsonb not null check(jsonb_typeof(submitted_payload)='object'),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(order_id,environment)
);

create table public.store_shipping_labels (
  order_id uuid not null references public.orders(id) on delete restrict,
  environment text not null check(environment in ('sandbox','producao')),
  id uuid not null unique default gen_random_uuid(),
  provider_id uuid,
  service_id integer not null check(service_id>0),
  agency_id integer,
  max_cost_cents integer not null check(max_cost_cents>0),
  cost_cents integer check(cost_cents>=0),
  invoice_key text not null check(invoice_key ~ '^[0-9]{44}$'),
  status text not null check(status in ('cart_creating','cart_ready','buying','paid','generating','generated','cancelling','cancelled','posted','delivered')),
  carrier text, tracking_code text,
  updated_at timestamptz not null default clock_timestamp(),
  primary key(order_id,environment),
  unique(environment,provider_id)
);

alter table public.store_nfe_documents enable row level security;
alter table public.store_shipping_labels enable row level security;
revoke all on public.store_nfe_documents,public.store_shipping_labels from public,anon,authenticated;
grant select (order_id,environment,reference,status,invoice_key,provider_message,updated_at) on public.store_nfe_documents to authenticated;
grant select on public.store_shipping_labels to authenticated;
grant select,insert,update on public.store_nfe_documents,public.store_shipping_labels to service_role;
create policy store_nfe_admin_read on public.store_nfe_documents for select to authenticated using((select private.is_admin()));
create policy store_label_admin_read on public.store_shipping_labels for select to authenticated using((select private.is_admin()));

create function private.order_fulfillment_on_hold(p_order_id uuid)
returns boolean language sql stable security invoker set search_path=''
as $$
  select exists(select 1 from public.store_order_cancellations where order_id=p_order_id and state='requested')
    or exists(select 1 from public.commercial_provider_payments p
      join public.commercial_payment_checkouts c on c.id=p.checkout_id
      where c.order_id=p_order_id and p.confirmed_at is not null and p.result<>'confirmed')
$$;
revoke all on function private.order_fulfillment_on_hold(uuid) from public,anon,authenticated;
grant execute on function private.order_fulfillment_on_hold(uuid) to service_role;

create function private.order_has_prior_shipping_evidence(p_order_id uuid)
returns boolean language sql stable security invoker set search_path=''
as $$
  select exists(select 1 from public.shipment_provider_documents where order_id=p_order_id)
    or exists(select 1 from public.shipment_tracking_provider_events where order_id=p_order_id)
    or exists(select 1 from public.shipment_cancellation_reviews
      where order_id=p_order_id and status='pending_internal_review')
$$;
revoke all on function private.order_has_prior_shipping_evidence(uuid) from public,anon,authenticated;
grant execute on function private.order_has_prior_shipping_evidence(uuid) to service_role;

create function public.claim_store_nfe(p_order_id uuid,p_environment text,p_total_cents integer,p_payload jsonb,p_retry_reference uuid default null)
returns uuid language plpgsql security invoker set search_path=''
as $$
declare v_order public.orders%rowtype; v_ref uuid;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.origin<>'admin_manual' or v_order.status not in ('paid','packing')
    or v_order.total_cents is distinct from p_total_cents or private.order_fulfillment_on_hold(p_order_id)
    then raise exception 'Confira pagamento, valores ou cancelamento pendente antes de emitir a NF-e'; end if;
  if p_retry_reference is not null then
    update public.store_nfe_documents set updated_at=clock_timestamp()
      where order_id=p_order_id and environment=p_environment and reference=p_retry_reference
        and submitted_payload=p_payload and status='submitting' and updated_at<clock_timestamp()-interval '1 minute'
      returning reference into v_ref;
    return v_ref;
  end if;
  insert into public.store_nfe_documents(order_id,environment,status,submitted_payload)
    values(p_order_id,p_environment,'submitting',p_payload)
    on conflict(order_id,environment) do update set reference=gen_random_uuid(),status='submitting',
      submitted_payload=excluded.submitted_payload,provider_message=null,updated_at=clock_timestamp()
    where store_nfe_documents.status='rejected'
    returning reference into v_ref;
  return v_ref;
end;
$$;

create function public.claim_store_nfe_cancel(p_order_id uuid,p_environment text)
returns uuid language plpgsql security invoker set search_path=''
as $$
declare v_ref uuid; v_status text;
begin
  select status into v_status from public.orders where id=p_order_id and origin='admin_manual' and shipped_at is null for update;
  if not found or v_status not in ('refunded','cancelled') and not exists (
    select 1 from public.store_order_cancellations where order_id=p_order_id and state='requested'
  ) then raise exception 'Confira o cancelamento do pedido e a situação da postagem antes de cancelar a NF-e'; end if;
  if exists (select 1 from public.store_shipping_labels where order_id=p_order_id
    and environment=case when p_environment='producao' then 'producao' else 'sandbox' end
    and status<>'cancelled') then raise exception 'Conclua o cancelamento da etiqueta antes de cancelar a NF-e'; end if;
  update public.store_nfe_documents set status='cancelling',updated_at=clock_timestamp()
    where order_id=p_order_id and environment=p_environment and status='authorized' returning reference into v_ref;
  return v_ref;
end;
$$;

create function public.claim_store_label_cart(
  p_order_id uuid,p_environment text,p_service_id integer,p_agency_id integer,p_max_cost_cents integer,p_invoice_key text
) returns uuid language plpgsql security invoker set search_path=''
as $$
declare v_id uuid;
begin
  perform 1 from public.orders where id=p_order_id and origin='admin_manual' and status in ('paid','packing') for update;
  if not found or private.order_fulfillment_on_hold(p_order_id)
    or not exists(select 1 from public.store_nfe_documents where order_id=p_order_id
      and environment=case when p_environment='producao' then 'producao' else 'homologacao' end
      and status='authorized' and invoice_key=p_invoice_key)
    then raise exception 'Confira pagamento, NF-e autorizada e cancelamentos do pedido'; end if;
  if p_environment='producao' and private.order_has_prior_shipping_evidence(p_order_id) then
    raise exception 'Confira as evidências de envio existentes antes de contratar outro frete';
  end if;
  insert into public.store_shipping_labels(order_id,environment,service_id,agency_id,max_cost_cents,invoice_key,status)
    values(p_order_id,p_environment,p_service_id,p_agency_id,p_max_cost_cents,p_invoice_key,'cart_creating')
  on conflict(order_id,environment) do update set id=gen_random_uuid(),provider_id=null,service_id=excluded.service_id,
      agency_id=excluded.agency_id,max_cost_cents=excluded.max_cost_cents,invoice_key=excluded.invoice_key,
      status='cart_creating',cost_cents=null,tracking_code=null,carrier=null,updated_at=clock_timestamp()
    where store_shipping_labels.status='cancelled'
  returning id into v_id;
  return v_id;
end;
$$;

create function public.claim_store_label_step(p_order_id uuid,p_environment text,p_action text)
returns boolean language plpgsql security invoker set search_path=''
as $$
declare v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id and origin='admin_manual' for update;
  if not found then raise exception 'Pedido indisponível'; end if;
  if p_action='cancel' then
    update public.store_shipping_labels set status='cancelling',updated_at=clock_timestamp()
      where order_id=p_order_id and environment=p_environment and status in ('cart_ready','paid','generated') and provider_id is not null;
    return found;
  end if;
  if v_order.status not in ('paid','packing') or private.order_fulfillment_on_hold(p_order_id)
    then raise exception 'Confira o pagamento e o cancelamento do pedido'; end if;
  if p_action='buy' and p_environment='producao' and private.order_has_prior_shipping_evidence(p_order_id) then
    raise exception 'Confira as evidências de envio existentes antes de contratar outro frete';
  end if;
  update public.store_shipping_labels l set status=case when p_action='buy' then 'buying' else 'generating' end,
    updated_at=clock_timestamp()
    where l.order_id=p_order_id and l.environment=p_environment and l.provider_id is not null
      and ((p_action='buy' and l.status='cart_ready' and l.cost_cents<=l.max_cost_cents)
       or (p_action='generate' and l.status='paid'))
      and exists(select 1 from public.store_nfe_documents d where d.order_id=p_order_id
        and d.environment=case when p_environment='producao' then 'producao' else 'homologacao' end
        and d.status='authorized' and d.invoice_key=l.invoice_key);
  return found;
end;
$$;

revoke all on function public.claim_store_nfe(uuid,text,integer,jsonb,uuid),public.claim_store_nfe_cancel(uuid,text),
  public.claim_store_label_cart(uuid,text,integer,integer,integer,text),public.claim_store_label_step(uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.claim_store_nfe(uuid,text,integer,jsonb,uuid),public.claim_store_nfe_cancel(uuid,text),
  public.claim_store_label_cart(uuid,text,integer,integer,integer,text),public.claim_store_label_step(uuid,text,text) to service_role;

create function private.guard_storefront_dispatch()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if old.status is distinct from new.status and new.status='shipped'
    and (old.storefront_order or exists(select 1 from public.store_shipping_labels where order_id=old.id
      and environment='producao' and status<>'cancelled')) and not exists (
    select 1 from public.store_shipping_labels l join public.store_nfe_documents d on d.order_id=l.order_id
    where l.order_id=old.id and l.environment='producao' and l.status in ('posted','delivered')
      and d.environment='producao' and d.status='authorized' and d.invoice_key=l.invoice_key
      and l.tracking_code=new.tracking_code and l.carrier=new.carrier
  ) then raise exception 'Confirme no Melhor Envio a postagem da etiqueta oficial vinculada à NF-e'; end if;
  return new;
end;
$$;
revoke all on function private.guard_storefront_dispatch() from public,anon,authenticated;
create trigger guard_storefront_dispatch before update of status on public.orders
  for each row execute function private.guard_storefront_dispatch();

notify pgrst, 'reload schema';
commit;
