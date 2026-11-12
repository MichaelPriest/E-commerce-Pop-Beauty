-- Popê Beauty: histórico privado de cotações de homologação. NÃO É preço comercial.
-- Um registro é uma cotação validada pelo backend para a intenção vigente.
create table if not exists public.shipment_sandbox_quote_snapshots (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete cascade,
 intent_key uuid not null,
 source_fingerprint text not null check(source_fingerprint ~ '^[0-9a-f]{64}$'),
 provider text not null default 'melhor_envio' check(provider='melhor_envio'),
 environment text not null default 'sandbox' check(environment='sandbox'),
 service_id text not null check(service_id ~ '^[0-9]{1,8}$'),
 service_name text not null check(char_length(service_name) between 1 and 80),
 carrier_name text not null check(char_length(carrier_name) between 1 and 80),
 price_cents integer not null check(price_cents between 1 and 100000000),
 delivery_days integer not null check(delivery_days between 0 and 180),
 quoted_at timestamptz not null default now(),
 reference_expires_at timestamptz not null default (now()+interval '15 minutes'),
 created_by uuid references auth.users(id) on delete set null,
 constraint sandbox_quote_reference_window check(reference_expires_at>quoted_at
   and reference_expires_at<=quoted_at+interval '15 minutes')
);
create index if not exists shipment_sandbox_quotes_order_time
 on public.shipment_sandbox_quote_snapshots(order_id,quoted_at desc);
create index if not exists shipment_sandbox_quotes_intent_time
 on public.shipment_sandbox_quote_snapshots(intent_key,quoted_at desc);
alter table public.shipment_sandbox_quote_snapshots enable row level security;
revoke all on public.shipment_sandbox_quote_snapshots from public,anon,authenticated;
grant select on public.shipment_sandbox_quote_snapshots to authenticated;
drop policy if exists shipment_sandbox_quotes_admin_read on public.shipment_sandbox_quote_snapshots;
create policy shipment_sandbox_quotes_admin_read
 on public.shipment_sandbox_quote_snapshots for select to authenticated
 using((select private.is_admin()));

create or replace function private.record_shipment_sandbox_quote(
 p_order_id uuid,p_intent_key uuid,p_service_id text,p_service_name text,
 p_carrier_name text,p_price_cents integer,p_delivery_days integer
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_stage jsonb;
 v_intent public.internal_label_intents%rowtype;
 v_id uuid;
 v_expires timestamptz;
 v_count integer;
 v_service text := btrim(coalesce(p_service_id,''));
 v_name text := btrim(coalesce(p_service_name,''));
 v_carrier text := btrim(coalesce(p_carrier_name,''));
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administradores podem registrar cotações de teste' using errcode='42501';
 end if;
 if p_order_id is null or p_intent_key is null
    or v_service !~ '^[0-9]{1,8}$'
    or char_length(v_name) not between 1 and 80
    or char_length(v_carrier) not between 1 and 80
    or p_price_cents is null or p_price_cents not between 1 and 100000000
    or p_delivery_days is null or p_delivery_days not between 0 and 180 then
  raise exception 'Informações de cotação inválidas';
 end if;

 -- Recalcula os dados dentro da mesma transação e detém lock de pedido;
 -- modificações de endereço/volumes/serviço tornam a intenção anterior obsoleta.
 v_stage := private.stage_internal_label_intent(p_order_id);
 if coalesce((v_stage->>'changed')::boolean,true)
    or (v_stage->>'intent_key')::uuid is distinct from p_intent_key then
  raise exception 'Intenção desatualizada. Refaça a conferência antes de armazenar a cotação';
 end if;
 select * into v_intent from public.internal_label_intents
  where order_id=p_order_id and intent_key=p_intent_key for update;
 if not found or v_intent.provider<>'melhor_envio'
    or v_intent.service_code is distinct from v_service then
  raise exception 'Serviço ou transportadora não corresponde à intenção';
 end if;

 -- Reduz acúmulo acidental de respostas de sandbox (não é antifraude de produção).
 select count(*)::integer into v_count
 from public.shipment_sandbox_quote_snapshots
 where order_id=p_order_id and quoted_at>now()-interval '1 hour';
 if v_count>=30 then
  raise exception 'Limite de 30 consultas registradas por hora para este pedido';
 end if;

 insert into public.shipment_sandbox_quote_snapshots (
  order_id,intent_key,source_fingerprint,provider,environment,
  service_id,service_name,carrier_name,price_cents,delivery_days,created_by
 ) values (
  p_order_id,p_intent_key,v_intent.source_fingerprint,'melhor_envio','sandbox',
  v_service,v_name,v_carrier,p_price_cents,p_delivery_days,auth.uid()
 ) returning id,reference_expires_at into v_id,v_expires;

 return jsonb_build_object(
  'saved',true,'snapshot_id',v_id,'expires_at',v_expires,
  'provider','melhor_envio','environment','sandbox',
  'quotation_only',true,'shipment_purchased',false,
  'label_generated',false,'ready_for_label_purchase',false
 );
end;
$$;
revoke all on function private.record_shipment_sandbox_quote(
 uuid,uuid,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function private.record_shipment_sandbox_quote(
 uuid,uuid,text,text,text,integer,integer) to authenticated;

create or replace function public.record_shipment_sandbox_quote(
 p_order_id uuid,p_intent_key uuid,p_service_id text,p_service_name text,
 p_carrier_name text,p_price_cents integer,p_delivery_days integer
) returns jsonb language sql security invoker set search_path=''
as $$select private.record_shipment_sandbox_quote(
 p_order_id,p_intent_key,p_service_id,p_service_name,p_carrier_name,
 p_price_cents,p_delivery_days)$$;
revoke all on function public.record_shipment_sandbox_quote(
 uuid,uuid,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.record_shipment_sandbox_quote(
 uuid,uuid,text,text,text,integer,integer) to authenticated;

comment on table public.shipment_sandbox_quote_snapshots is
 'Histórico admin de cotações de teste Melhor Envio. Prazo 15 min é referência interna, não validade do provedor. Nunca autoriza checkout, compra ou impressão.';
