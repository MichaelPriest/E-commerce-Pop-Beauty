-- Popê Beauty — Endereços e reserva de pedidos em HOMOLOGAÇÃO.
-- Nunca cria cobranças nem confirma pagamento; público bloqueado por padrão.
-- RLS protege endereços; operações de estoque são atômicas e expiram em 15 minutos.

create table if not exists public.customer_addresses(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 recipient text not null check(length(recipient) between 2 and 120),
 phone text not null check(phone ~ '^[0-9]{10,11}$'),
 postal_code text not null check(postal_code ~ '^[0-9]{8}$'),
 street text not null check(length(street) between 4 and 120),
 house_number text not null check(length(house_number) between 1 and 20),
 complement text not null default '' check(length(complement)<=120),
 district text not null check(length(district) between 2 and 80),
 city text not null check(length(city) between 2 and 80),
 state_code char(2) not null check(state_code in (
 'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
 'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
 is_default boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz
);
create index if not exists idx_customer_addresses_owner on public.customer_addresses(user_id,created_at desc);
create unique index if not exists idx_customer_addresses_one_default on public.customer_addresses(user_id)
 where is_default and archived_at is null;
alter table public.customer_addresses enable row level security;
drop policy if exists "customer_addresses_read_self" on public.customer_addresses;
create policy "customer_addresses_read_self" on public.customer_addresses
 for select to authenticated using (user_id=(select auth.uid()) and archived_at is null);
revoke all on public.customer_addresses from public,anon,authenticated;
grant select on public.customer_addresses to authenticated;

create or replace function private.save_customer_address(
 p_id uuid,p_recipient text,p_phone text,p_postal_code text,p_street text,
 p_house_number text,p_complement text,p_district text,p_city text,
 p_state_code text,p_default boolean
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_user uuid;v_id uuid;v_phone text;v_zip text;v_state text;
begin
 v_user:=auth.uid();
 if v_user is null or (auth.jwt()->>'is_anonymous')='true' then
  raise exception 'É necessário entrar na conta para salvar um endereço' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtext('pope-address:'||v_user::text));
 v_phone:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
 v_zip:=regexp_replace(coalesce(p_postal_code,''),'[^0-9]','','g');
 v_state:=upper(btrim(coalesce(p_state_code,'')));
 if length(btrim(coalesce(p_recipient,''))) not between 2 and 120 or
    length(v_phone) not between 10 and 11 or length(v_zip)<>8 or
    length(btrim(coalesce(p_street,''))) not between 4 and 120 or
    length(btrim(coalesce(p_house_number,''))) not between 1 and 20 or
    length(coalesce(p_complement,''))>120 or
    length(btrim(coalesce(p_district,''))) not between 2 and 80 or
    length(btrim(coalesce(p_city,''))) not between 2 and 80 or
    v_state not in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
      'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')
 then raise exception 'Revise nome, telefone, CEP e endereço antes de salvar';end if;
 if p_id is null then
  if (select count(*) from public.customer_addresses where user_id=v_user and archived_at is null)>=10
  then raise exception 'Limite de 10 endereços cadastrados';end if;
  v_id:=gen_random_uuid();
 else
  select id into v_id from public.customer_addresses
   where id=p_id and user_id=v_user and archived_at is null for update;
  if not found then raise exception 'Endereço não encontrado';end if;
 end if;
 if coalesce(p_default,false) or
    not exists(select 1 from public.customer_addresses where user_id=v_user
               and archived_at is null and is_default and id<>v_id) then
  update public.customer_addresses set is_default=false
   where user_id=v_user and archived_at is null and is_default and id<>v_id;
  p_default:=true;
 end if;
 insert into public.customer_addresses(id,user_id,recipient,phone,postal_code,
  street,house_number,complement,district,city,state_code,is_default)
 values(v_id,v_user,btrim(p_recipient),v_phone,v_zip,btrim(p_street),
  btrim(p_house_number),btrim(coalesce(p_complement,'')),btrim(p_district),
  btrim(p_city),v_state,p_default)
 on conflict(id) do update set
  recipient=excluded.recipient,phone=excluded.phone,postal_code=excluded.postal_code,
  street=excluded.street,house_number=excluded.house_number,
  complement=excluded.complement,district=excluded.district,city=excluded.city,
  state_code=excluded.state_code,is_default=excluded.is_default,updated_at=now()
 where public.customer_addresses.user_id=v_user and public.customer_addresses.archived_at is null;
 return v_id;
end;
$$;
revoke all on function private.save_customer_address(uuid,text,text,text,text,text,text,text,text,text,boolean)
 from public,anon;
grant execute on function private.save_customer_address(uuid,text,text,text,text,text,text,text,text,text,boolean)
 to authenticated;
create or replace function public.save_customer_address(
 p_id uuid default null,p_recipient text default null,p_phone text default null,
 p_postal_code text default null,p_street text default null,p_house_number text default null,
 p_complement text default '',p_district text default null,p_city text default null,
 p_state_code text default null,p_default boolean default false
) returns uuid language sql security invoker set search_path=''
as $$
 select private.save_customer_address(p_id,p_recipient,p_phone,p_postal_code,p_street,
  p_house_number,p_complement,p_district,p_city,p_state_code,p_default)
$$;
revoke all on function public.save_customer_address(uuid,text,text,text,text,text,text,text,text,text,boolean)
 from public,anon;
grant execute on function public.save_customer_address(uuid,text,text,text,text,text,text,text,text,text,boolean)
 to authenticated;

create or replace function private.archive_customer_address(p_id uuid)
 returns boolean language plpgsql security definer set search_path=''
as $$
declare v_uid uuid;
begin
 v_uid:=auth.uid();
 if v_uid is null then raise exception 'Acesso negado' using errcode='42501';end if;
 update public.customer_addresses set archived_at=now(),is_default=false,updated_at=now()
 where id=p_id and user_id=v_uid and archived_at is null;
 if not found then raise exception 'Endereço não encontrado';end if;
 -- Prefere o endereço mais recente quando o usuário excluiu o padrão.
 if not exists(select 1 from public.customer_addresses
   where user_id=v_uid and archived_at is null and is_default) then
  update public.customer_addresses set is_default=true,updated_at=now()
  where id=(select id from public.customer_addresses where user_id=v_uid
   and archived_at is null order by created_at desc limit 1);
 end if;
 return true;
end;
$$;
revoke all on function private.archive_customer_address(uuid) from public,anon;
grant execute on function private.archive_customer_address(uuid) to authenticated;
create or replace function public.archive_customer_address(p_id uuid)
 returns boolean language sql security invoker set search_path=''
as $$select private.archive_customer_address(p_id)$$;
revoke all on function public.archive_customer_address(uuid) from public,anon;
grant execute on function public.archive_customer_address(uuid) to authenticated;

alter table public.store_settings
 add column if not exists checkout_reservations_enabled boolean not null default false;
alter table public.orders
 add column if not exists checkout_key uuid,
 add column if not exists reservation_expires_at timestamptz,
 add column if not exists shipping_address_snapshot jsonb;
create unique index if not exists idx_orders_store_checkout_idempotency
 on public.orders(customer_id,checkout_key) where origin='store_api' and checkout_key is not null;
create unique index if not exists idx_orders_one_pending_store_per_user
 on public.orders(customer_id) where origin='store_api' and status='pending';
create index if not exists idx_orders_checkout_reservation_expiry
 on public.orders(reservation_expires_at) where origin='store_api' and status='pending';

-- Pedido de homologação não gera e-mail "pedido recebido" ou "cancelado":
-- comunicação de pedidos exige gateway aprovado antes de ativar publicamente.
create or replace function private.enqueue_order_notification() returns trigger
 language plpgsql security definer set search_path=''
as $$
declare v_email text; v_name text; v_adult boolean;
begin
 if new.event_type not in ('created','payment_confirmed','shipped','delivered','cancelled') then
  return new;
 end if;
 if not exists(select 1 from public.orders o where o.id=new.order_id
   and o.customer_id is not null and o.origin<>'store_api') then
  return new;
 end if;
 select u.email,p.display_name into v_email,v_name from public.orders o
 join auth.users u on u.id=o.customer_id
 left join public.profiles p on p.id=u.id
 where o.id=new.order_id;
 if v_email is null or length(v_email) not between 3 and 254 then return new;end if;
 select exists (
  select 1 from public.order_items oi
   join public.variants v on oi.variant_id=v.id
   join public.products p on v.product_id=p.id
   where oi.order_id=new.order_id and p.is_adult
 ) into v_adult;
 if v_adult then return new;end if;
 insert into public.order_notifications(
  order_event_id,order_id,customer_id,event_type,recipient_email,recipient_name
 ) values (new.id,new.order_id,
  (select customer_id from public.orders where id=new.order_id),
  new.event_type,v_email,coalesce(v_name,''))
 on conflict(order_event_id) do nothing;
 return new;
end;
$$;
revoke all on function private.enqueue_order_notification() from public,anon,authenticated;

-- O expirador roda em cron como postgres; nenhuma chamada pública habilitada.
create or replace function private.expire_checkout_orders(p_limit integer default 100)
 returns integer language plpgsql security definer set search_path=''
as $$
declare v_order record;v_item record;v_count integer:=0;
begin
 perform pg_advisory_xact_lock(hashtext('pope-checkout-serialization'));
 for v_order in select id from public.orders
  where origin='store_api' and status='pending'
    and reservation_expires_at <= now()
  order by reservation_expires_at,id
  for update skip locked limit greatest(1,least(coalesce(p_limit,100),200))
 loop
  for v_item in select variant_id,quantity from public.order_items
    where order_id=v_order.id order by variant_id
  loop
   update public.inventory set reserved=reserved-v_item.quantity,updated_at=now()
    where variant_id=v_item.variant_id and reserved>=v_item.quantity;
   if not found then raise exception 'Inconsistência ao expirar reserva; pedido %',v_order.id;end if;
  end loop;
  update public.orders set status='cancelled',updated_at=now() where id=v_order.id;
  insert into public.order_events(order_id,event_type,note,actor_id)
    values(v_order.id,'cancelled','Reserva de homologação expirada; nenhum pagamento realizado.',null);
  v_count:=v_count+1;
 end loop;
 return v_count;
end;
$$;
revoke all on function private.expire_checkout_orders(integer) from public,anon,authenticated;

create or replace function private.create_checkout_order(
 p_address_id uuid,p_items jsonb,p_request_key uuid
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_uid uuid;v_email_confirmed timestamptz;v_address record;v_order_id uuid;
v_item record;v_product record;v_stock record;v_variant uuid;v_count integer;
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
  select e->>'product_id' as k from jsonb_array_elements(p_items) e group by 1 having count(*)>1
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
 for v_item in select e->>'product_id' as product_id,e->>'quantity' as quantity_text
  from jsonb_array_elements(p_items) e order by 1
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
  select count(*)::integer,min(v.id::text)::uuid into v_count,v_variant
   from public.variants v where v.product_id=v_product.id and v.active;
  if v_count<>1 then raise exception 'É necessário escolher uma variação disponível';end if;
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
$$;
revoke all on function private.create_checkout_order(uuid,jsonb,uuid) from public,anon;
grant execute on function private.create_checkout_order(uuid,jsonb,uuid) to authenticated;
create or replace function public.create_checkout_order(
 p_address_id uuid,p_items jsonb,p_request_key uuid
) returns uuid language sql security invoker set search_path=''
as $$select private.create_checkout_order(p_address_id,p_items,p_request_key)$$;
revoke all on function public.create_checkout_order(uuid,jsonb,uuid) from public,anon;
grant execute on function public.create_checkout_order(uuid,jsonb,uuid) to authenticated;

create or replace function private.cancel_checkout_order(p_order_id uuid)
 returns boolean language plpgsql security definer set search_path=''
as $$
declare v_uid uuid;v_order record;v_line record;
begin
 v_uid:=auth.uid();
 if v_uid is null then raise exception 'Acesso negado' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('pope-checkout-serialization'));
 select id,status,origin into v_order from public.orders
  where id=p_order_id and customer_id=v_uid for update;
 if not found or v_order.origin<>'store_api' then raise exception 'Reserva não encontrada';end if;
 if v_order.status='cancelled' then return false;end if;
 if v_order.status<>'pending' then raise exception 'Esta reserva não pode mais ser cancelada';end if;
 for v_line in select variant_id,quantity from public.order_items
  where order_id=p_order_id order by variant_id
 loop
  update public.inventory set reserved=reserved-v_line.quantity,updated_at=now()
   where variant_id=v_line.variant_id and reserved>=v_line.quantity;
  if not found then raise exception 'Saldo reservado inconsistente';end if;
 end loop;
 update public.orders set status='cancelled',updated_at=now() where id=p_order_id;
 insert into public.order_events(order_id,event_type,note,actor_id)
 values(p_order_id,'cancelled','Reserva de homologação cancelada pelo titular.',v_uid);
 return true;
end;
$$;
revoke all on function private.cancel_checkout_order(uuid) from public,anon;
grant execute on function private.cancel_checkout_order(uuid) to authenticated;
create or replace function public.cancel_checkout_order(p_order_id uuid)
 returns boolean language sql security invoker set search_path=''
as $$select private.cancel_checkout_order(p_order_id)$$;
revoke all on function public.cancel_checkout_order(uuid) from public,anon;
grant execute on function public.cancel_checkout_order(uuid) to authenticated;

-- Ativar Supabase Cron; liberação periódica sem depender de um usuário abrir o checkout.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('pope-checkout-expiry-every-minute','* * * * *',
  'select private.expire_checkout_orders(100);');

comment on function public.create_checkout_order(uuid,jsonb,uuid) is
 'Reserva de teste por 15min, com idempotência, preço e estoque validados no banco; não realiza venda nem pagamento.';
comment on column public.store_settings.checkout_reservations_enabled is
 'False: somente administradores podem simular reserva. Nunca habilitar ao público antes de homologar pagamento e frete.';
