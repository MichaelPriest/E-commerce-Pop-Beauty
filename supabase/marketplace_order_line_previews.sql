-- Conferência apenas: itens de pedidos externos sem PII e sem impacto no estoque.
create table if not exists public.marketplace_order_line_previews(
 id uuid primary key default gen_random_uuid(),
 connection_id uuid not null references public.marketplace_connections(id) on delete cascade,
 external_order_id text not null check(length(external_order_id) between 1 and 100),
 line_key text not null check(length(line_key) between 1 and 50),
 external_listing_id text not null default '' check(length(external_listing_id)<=100),
 external_variation_id text not null default '' check(length(external_variation_id)<=100),
 sku text not null default '' check(length(sku)<=100),
 title text not null default '' check(length(title)<=200),
 quantity integer check(quantity between 1 and 100000),
 unit_price_cents bigint check(unit_price_cents between 0 and 5000000000),
 updated_at timestamptz not null default now(),
 unique(connection_id,external_order_id,line_key)
);
create index if not exists idx_marketplace_order_line_previews_recent
 on public.marketplace_order_line_previews(connection_id,updated_at desc);
alter table public.marketplace_order_line_previews enable row level security;
revoke all on public.marketplace_order_line_previews from public,anon,authenticated;
grant select on public.marketplace_order_line_previews to authenticated;
drop policy if exists "marketplace_order_lines_admin_read" on public.marketplace_order_line_previews;
create policy "marketplace_order_lines_admin_read"
 on public.marketplace_order_line_previews for select to authenticated
 using((select private.is_admin()));

-- A operação atômica atualiza apenas pedidos cujos detalhes foram consultados.
-- Não usa orders/order_items, inventory, pagamentos ou e-mails.
create or replace function private.replace_marketplace_order_line_previews(
 p_connection_id uuid,p_orders jsonb
) returns integer
language plpgsql security definer set search_path=''
as $fn$
declare
 v_order jsonb; v_line jsonb; v_order_id text; v_line_key text;
 v_count integer:=0; v_orders_seen text[]:=array[]::text[];
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administradores podem importar pedidos' using errcode='42501';
 end if;
 if not exists(select 1 from public.marketplace_connections
  where id=p_connection_id and status='connected') then
  raise exception 'Conta marketplace não conectada';
 end if;
 if p_orders is null or jsonb_typeof(p_orders)<>'array'
   or jsonb_array_length(p_orders)>20 then
  raise exception 'Lote de pedidos inválido';
 end if;
 perform pg_advisory_xact_lock(hashtext('pope-marketplace-order-lines'),
  hashtext(p_connection_id::text));
 for v_order in select value from jsonb_array_elements(p_orders) loop
  v_order_id:=v_order->>'order_id';
  if coalesce(length(v_order_id),0) not between 1 and 100
   or v_order_id=any(v_orders_seen)
   or jsonb_typeof(v_order->'lines')<>'array'
   or jsonb_array_length(v_order->'lines')>60 then
   raise exception 'Dados de pedido inconsistentes';
  end if;
  v_orders_seen:=array_append(v_orders_seen,v_order_id);
  -- Revalidação de informações recebidas do provedor antes de apagar os itens anteriores.
  for v_line in select value from jsonb_array_elements(v_order->'lines') loop
   v_line_key:=v_line->>'line_key';
   if coalesce(length(v_line_key),0) not between 1 and 50
     or coalesce(length(v_line->>'sku'),0)>100
     or coalesce(length(v_line->>'title'),0)>200
     or coalesce(length(v_line->>'external_listing_id'),0)>100
     or coalesce(length(v_line->>'external_variation_id'),0)>100
     or (v_line->>'quantity') is not null and
      ((v_line->>'quantity') !~ '^[0-9]{1,6}$' or
       (v_line->>'quantity')::integer not between 1 and 100000)
     or (v_line->>'unit_price_cents') is not null and
      ((v_line->>'unit_price_cents') !~ '^[0-9]{1,12}$' or
       (v_line->>'unit_price_cents')::bigint not between 0 and 5000000000)
    then raise exception 'Dados de item externo inválidos';end if;
  end loop;
  delete from public.marketplace_order_line_previews
   where connection_id=p_connection_id and external_order_id=v_order_id;
  for v_line in select value from jsonb_array_elements(v_order->'lines') loop
   insert into public.marketplace_order_line_previews(
    connection_id,external_order_id,line_key,external_listing_id,
    external_variation_id,sku,title,quantity,unit_price_cents)
   values(
    p_connection_id,v_order_id,v_line->>'line_key',
    coalesce(v_line->>'external_listing_id',''),
    coalesce(v_line->>'external_variation_id',''),
    coalesce(v_line->>'sku',''),coalesce(v_line->>'title',''),
    (v_line->>'quantity')::integer,(v_line->>'unit_price_cents')::bigint);
   v_count:=v_count+1;
   if v_count>400 then raise exception 'Limite de itens excedido';end if;
  end loop;
 end loop;
 return v_count;
end;
$fn$;
revoke all on function private.replace_marketplace_order_line_previews(uuid,jsonb)
 from public,anon;
grant execute on function private.replace_marketplace_order_line_previews(uuid,jsonb)
 to authenticated;
create or replace function public.replace_marketplace_order_line_previews(
 p_connection_id uuid,p_orders jsonb
) returns integer language sql security invoker set search_path=''
as $fn$select private.replace_marketplace_order_line_previews(p_connection_id,p_orders)$fn$;
revoke all on function public.replace_marketplace_order_line_previews(uuid,jsonb)
 from public,anon;
grant execute on function public.replace_marketplace_order_line_previews(uuid,jsonb)
 to authenticated;
comment on table public.marketplace_order_line_previews is
 'Linhas sanitizadas de pedidos Shopee/Mercado Livre para conferência manual de SKUs. Não confirma venda nem reserva estoque.';
