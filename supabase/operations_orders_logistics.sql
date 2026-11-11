-- Operação manual de pedidos, estoque reservado e expedição. Não habilita checkout nem gateways.
alter table public.orders
 add column if not exists origin text not null default 'legacy' check(origin in ('legacy','admin_manual','marketplace_api','store_api')),
 add column if not exists payment_reference text,
 add column if not exists carrier text,
 add column if not exists tracking_code text,
 add column if not exists shipped_at timestamptz,
 add column if not exists delivered_at timestamptz,
 add column if not exists updated_at timestamptz not null default now();

create table if not exists public.order_events (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete cascade,
 event_type text not null check(event_type in ('created','payment_confirmed','packing','shipped','delivered','cancelled','note')),
 note text not null default '' check(length(note)<=500),
 actor_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists idx_order_events_order_created on public.order_events(order_id,created_at desc);
create index if not exists idx_orders_status_created on public.orders(status,created_at desc);
alter table public.order_events enable row level security;
create policy "order_events_staff_read" on public.order_events for select to authenticated
 using ((select private.is_staff()));
create policy "order_events_admin_insert" on public.order_events for insert to authenticated
 with check ((select private.is_admin()) and actor_id=(select auth.uid()));
grant select,insert on public.order_events to authenticated;

create unique index if not exists idx_marketplace_listings_one_variant_per_channel
 on public.marketplace_listings(variant_id,channel);

-- Histórico em escrita própria: somente operações administradas pelo banco.
-- As funções invoker exigem administrador e deixam regras de estoque sob RLS.
create or replace function public.create_admin_order(
 p_customer_id uuid,
 p_items jsonb
) returns uuid language plpgsql security invoker set search_path=''
as $$
declare
 v_id uuid;
 v_entry record;
 v_product record;
 v_stock record;
 v_quantity integer;
 v_total bigint:=0;
 v_lines integer:=0;
 v_available bigint;
begin
 if not private.is_admin() then
  raise exception 'Somente administrador pode criar pedidos internos' using errcode='42501';
 end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 30
 then raise exception 'O pedido precisa ter entre 1 e 30 itens'; end if;
 if p_customer_id is not null and not exists(select 1 from public.profiles where id=p_customer_id)
 then raise exception 'Cliente não encontrado'; end if;
 -- Bloqueia SKU repetido para não criar reserva inconsistente.
 if (select count(*) from (
  select (v->>'variant_id') as sku from jsonb_array_elements(p_items) v group by sku
 ) z) <> jsonb_array_length(p_items) then
  raise exception 'Não repita o mesmo SKU: agrupe a quantidade'; end if;

 -- Locks na ordem do UUID: evita deadlocks em pedidos simultâneos.
 for v_entry in
  select (item->>'variant_id')::uuid as variant_id, item->>'quantity' as quantity_text
  from jsonb_array_elements(p_items) item
  order by 1
 loop
  if v_entry.quantity_text is null or v_entry.quantity_text !~ '^[0-9]{1,3}$'
  then raise exception 'Quantidade inválida'; end if;
  v_quantity:=v_entry.quantity_text::integer;
  if v_quantity<1 or v_quantity>99 then raise exception 'Quantidade por SKU deve ser 1 a 99';end if;
  select i.on_hand,i.reserved,v.sku,v.active as variant_active,
   p.name,p.price_cents,p.active as product_active,p.is_adult
   into v_stock from public.inventory i join public.variants v on v.id=i.variant_id
   join public.products p on p.id=v.product_id
   where i.variant_id=v_entry.variant_id for update of i;
  if not found then raise exception 'SKU não encontrado';end if;
  if not v_stock.product_active or not v_stock.variant_active then
   raise exception 'Este SKU não está publicado'; end if;
  if v_stock.is_adult then
   raise exception 'Produtos adultos não podem ser vendidos por pedidos manuais. A comercialização +18 depende de verificação adequada.';end if;
  select coalesce(sum(l.on_hand),0) into v_available
   from public.inventory_lots l
   where l.variant_id=v_entry.variant_id
     and (l.expires_at is null or l.expires_at >= current_date);
  if v_stock.on_hand-v_stock.reserved<v_quantity or v_available-v_stock.reserved<v_quantity
  then raise exception 'Estoque disponível insuficiente para %',v_stock.sku;end if;
  v_total:=v_total+(v_stock.price_cents::bigint*v_quantity);
  if v_total>100000000 then raise exception 'Pedido excede limite financeiro';end if;
  v_lines:=v_lines+1;
 end loop;
 insert into public.orders(customer_id,channel,origin,status,total_cents)
  values(p_customer_id,'store','admin_manual','pending',v_total::integer) returning id into v_id;
 for v_entry in
  select (item->>'variant_id')::uuid as variant_id,(item->>'quantity')::integer as quantity
  from jsonb_array_elements(p_items) item order by 1
 loop
  select v.sku,p.name,p.price_cents into v_product
  from public.variants v join public.products p on p.id=v.product_id
  where v.id=v_entry.variant_id;
  insert into public.order_items(order_id,variant_id,sku_snapshot,title_snapshot,quantity,unit_price_cents)
  values(v_id,v_entry.variant_id,v_product.sku,v_product.name,v_entry.quantity,v_product.price_cents);
  update public.inventory
    set reserved=reserved+v_entry.quantity,updated_at=now()
    where variant_id=v_entry.variant_id;
 end loop;
 insert into public.order_events(order_id,event_type,note,actor_id)
 values(v_id,'created','Pedido interno criado; estoque reservado. Nenhuma cobrança realizada.',auth.uid());
 return v_id;
end;
$$;
revoke all on function public.create_admin_order(uuid,jsonb) from public,anon;
grant execute on function public.create_admin_order(uuid,jsonb) to authenticated;

create or replace function public.transition_admin_order(
 p_order_id uuid,
 p_next_status text,
 p_note text default null,
 p_carrier text default null,
 p_tracking_code text default null
) returns boolean language plpgsql security invoker set search_path=''
as $$
declare
 v_order record;
 v_line record;
 v_lot record;
 v_remain integer;
 v_take integer;
 v_carrier text;
 v_tracking text;
begin
 if not private.is_admin() then raise exception 'Somente administrador pode alterar pedidos' using errcode='42501';end if;
 if p_note is not null and length(p_note)>500 then raise exception 'Observação muito longa';end if;
 select * into v_order from public.orders where id=p_order_id for update;
 if not found then raise exception 'Pedido não encontrado';end if;
 if v_order.origin<>'admin_manual' then
  raise exception 'Somente pedidos manuais podem ser processados neste módulo';end if;
 if not (
  (v_order.status='pending' and p_next_status in ('paid','cancelled')) or
  (v_order.status='paid' and p_next_status='packing') or
  (v_order.status='packing' and p_next_status='shipped') or
  (v_order.status='shipped' and p_next_status='delivered')
 ) then raise exception 'Mudança de status inválida: % para %',v_order.status,p_next_status;end if;
 if p_next_status='paid' and length(btrim(coalesce(p_note,'')))<5 then
  raise exception 'Informe referência comprovável do pagamento recebido (mínimo 5 caracteres)';end if;
 if p_next_status='shipped' then
  v_carrier:=nullif(btrim(coalesce(p_carrier,'')),'');
  v_tracking:=nullif(btrim(coalesce(p_tracking_code,'')),'');
  if v_carrier is null or v_tracking is null or length(v_carrier)>90 or length(v_tracking)>120
  then raise exception 'Informe transportadora e código de rastreio para despachar';end if;
 end if;
 if p_next_status='cancelled' then
  for v_line in select variant_id,quantity from public.order_items
   where order_id=p_order_id and variant_id is not null order by variant_id
  loop
   update public.inventory set reserved=reserved-v_line.quantity,updated_at=now()
    where variant_id=v_line.variant_id and reserved>=v_line.quantity;
   if not found then raise exception 'Reserva inconsistente: cancelamento interrompido';end if;
  end loop;
 elsif p_next_status='shipped' then
  for v_line in select variant_id,quantity from public.order_items
    where order_id=p_order_id and variant_id is not null order by variant_id
  loop
   -- Não despacha itens de lotes vencidos; FEFO: vencimento próximo sai primeiro.
   v_remain:=v_line.quantity;
   for v_lot in select id,on_hand from public.inventory_lots
     where variant_id=v_line.variant_id and on_hand>0
       and (expires_at is null or expires_at>=current_date)
     order by expires_at asc nulls last,created_at,id for update
   loop
    exit when v_remain=0;
    v_take:=least(v_remain,v_lot.on_hand);
    update public.inventory_lots set on_hand=on_hand-v_take where id=v_lot.id;
    insert into public.stock_movements(variant_id,delta,reason,order_id,lot_id)
     values(v_line.variant_id,-v_take,'Expedição de pedido interno',p_order_id,v_lot.id);
    v_remain:=v_remain-v_take;
   end loop;
   if v_remain>0 then raise exception 'Lotes insuficientes ou vencidos; despacho interrompido';end if;
   update public.inventory set on_hand=on_hand-v_line.quantity,reserved=reserved-v_line.quantity,updated_at=now()
    where variant_id=v_line.variant_id and on_hand>=v_line.quantity and reserved>=v_line.quantity;
   if not found then raise exception 'Saldo inconsistente para expedição';end if;
  end loop;
 end if;
 update public.orders
 set status=p_next_status,
  payment_reference=case when p_next_status='paid' then btrim(p_note) else payment_reference end,
  carrier=case when p_next_status='shipped' then v_carrier else carrier end,
  tracking_code=case when p_next_status='shipped' then v_tracking else tracking_code end,
  shipped_at=case when p_next_status='shipped' then now() else shipped_at end,
  delivered_at=case when p_next_status='delivered' then now() else delivered_at end,
  updated_at=now()
 where id=p_order_id;
 insert into public.order_events(order_id,event_type,note,actor_id)
 values(p_order_id,case p_next_status when 'paid' then 'payment_confirmed' else p_next_status end,
  left(btrim(coalesce(p_note,'')),500),auth.uid());
 return true;
end;
$$;
revoke all on function public.transition_admin_order(uuid,text,text,text,text) from public,anon;
grant execute on function public.transition_admin_order(uuid,text,text,text,text) to authenticated;

-- Cadastro de vínculo, sem credenciais nem marcação enganosa de sincronização.
create or replace function public.link_marketplace_listing(
 p_variant_id uuid,p_channel text,p_external_listing_id text
) returns uuid language plpgsql security invoker set search_path=''
as $$
declare v_id uuid;
begin
 if not private.is_admin() then raise exception 'Sem permissão' using errcode='42501';end if;
 if p_channel not in ('shopee','mercadolivre') then raise exception 'Marketplace inválido';end if;
 if p_external_listing_id is null or length(btrim(p_external_listing_id)) not between 2 and 100 then
   raise exception 'Identificador externo inválido';end if;
 if not exists(select 1 from public.variants v join public.products p on p.id=v.product_id
  where v.id=p_variant_id and not p.is_adult) then
   raise exception 'SKU não permitido: somente produtos não adultos';end if;
 insert into public.marketplace_listings(variant_id,channel,external_listing_id,sync_status,last_synced_at)
 values(p_variant_id,p_channel,btrim(p_external_listing_id),'linked_not_synced',null)
 on conflict(variant_id,channel) do update set
 external_listing_id=excluded.external_listing_id,sync_status='linked_not_synced',last_synced_at=null
 returning id into v_id;
 return v_id;
end;
$$;
revoke all on function public.link_marketplace_listing(uuid,text,text) from public,anon;
grant execute on function public.link_marketplace_listing(uuid,text,text) to authenticated;
