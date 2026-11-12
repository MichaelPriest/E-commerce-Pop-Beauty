-- Popê Beauty: preparação operacional, NÃO autoriza compra, emissão ou postagem.
-- Instala bucket privado e deixa todas as operações de arquivo sem políticas de cliente.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('pope-shipping-private','pope-shipping-private',false,8388608,array['application/pdf']::text[])
on conflict(id) do update set public=false,file_size_limit=8388608,
 allowed_mime_types=array['application/pdf']::text[];

create table if not exists public.shipment_workflow_requests (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete cascade,
 intent_key uuid not null,
 request_key uuid not null unique default gen_random_uuid(),
 source_fingerprint text not null check(source_fingerprint ~ '^[a-f0-9]{64}$'),
 provider text not null check(provider in ('melhor_envio','correios')),
 request_type text not null default 'label_preparation' check(request_type='label_preparation'),
 status text not null default 'prepared_internal' check(status in ('prepared_internal','voided_internal')),
 created_by uuid references auth.users(id) on delete set null,
 voided_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 voided_at timestamptz,
 unique(order_id,intent_key),
 constraint shipment_workflow_void_state check(
  (status='prepared_internal' and voided_at is null)
  or (status='voided_internal' and voided_at is not null)
 )
);
create index if not exists shipment_workflow_order_time
 on public.shipment_workflow_requests(order_id,created_at desc);
alter table public.shipment_workflow_requests enable row level security;
revoke all on public.shipment_workflow_requests from public,anon,authenticated;
grant select on public.shipment_workflow_requests to authenticated;
drop policy if exists shipment_workflow_admin_read on public.shipment_workflow_requests;
create policy shipment_workflow_admin_read on public.shipment_workflow_requests
 for select to authenticated using((select private.is_admin()));

create table if not exists public.shipment_internal_events (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete cascade,
 request_id uuid not null references public.shipment_workflow_requests(id) on delete cascade,
 event_type text not null check(event_type in (
  'request_prepared','request_voided','address_reviewed','packages_reviewed',
  'fiscal_pending','carrier_pending'
 )),
 source text not null default 'admin_internal' check(source='admin_internal'),
 actor_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists shipment_internal_events_order_time
 on public.shipment_internal_events(order_id,created_at desc);
alter table public.shipment_internal_events enable row level security;
revoke all on public.shipment_internal_events from public,anon,authenticated;
grant select on public.shipment_internal_events to authenticated;
drop policy if exists shipment_internal_events_admin_read on public.shipment_internal_events;
create policy shipment_internal_events_admin_read on public.shipment_internal_events
 for select to authenticated using((select private.is_admin()));

-- Metadados de documentos oficiais futuros: nenhuma escrita por cliente autenticado.
-- Nenhuma rota de upload é fornecida nesta versão.
create table if not exists public.shipment_provider_documents (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.shipment_workflow_requests(id) on delete cascade,
 order_id uuid not null references public.orders(id) on delete cascade,
 document_type text not null check(document_type in ('official_label','posting_receipt','posting_manifest')),
 bucket_id text not null default 'pope-shipping-private'
   check(bucket_id='pope-shipping-private'),
 object_path text not null unique check(
  object_path ~ '^[a-zA-Z0-9/_-]{5,240}\\.pdf$' and position('..' in object_path)=0
 ),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 provider_document_id text not null check(char_length(provider_document_id) between 1 and 120),
 verified_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create index if not exists shipment_provider_docs_request
 on public.shipment_provider_documents(request_id,created_at desc);
alter table public.shipment_provider_documents enable row level security;
revoke all on public.shipment_provider_documents from public,anon,authenticated;
grant select on public.shipment_provider_documents to authenticated;
drop policy if exists shipment_provider_docs_admin_read on public.shipment_provider_documents;
create policy shipment_provider_docs_admin_read on public.shipment_provider_documents
 for select to authenticated using((select private.is_admin()));

-- Eventos de rastreio autenticados pelo provedor: estrutura futura, sem endpoint
-- de webhook ou funções de gravação liberadas nesta fase.
create table if not exists public.shipment_tracking_provider_events (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.shipment_workflow_requests(id) on delete cascade,
 order_id uuid not null references public.orders(id) on delete cascade,
 provider text not null check(provider in ('melhor_envio','correios')),
 provider_event_id text not null check(char_length(provider_event_id) between 1 and 120),
 carrier_status text not null check(char_length(carrier_status) between 1 and 80),
 description text check(description is null or char_length(description)<=400),
 occurred_at timestamptz not null,
 verified_source text not null default 'provider_authenticated'
   check(verified_source='provider_authenticated'),
 received_at timestamptz not null default now(),
 unique(provider,provider_event_id)
);
create index if not exists shipment_tracking_order_time
 on public.shipment_tracking_provider_events(order_id,occurred_at desc);
alter table public.shipment_tracking_provider_events enable row level security;
revoke all on public.shipment_tracking_provider_events from public,anon,authenticated;
grant select on public.shipment_tracking_provider_events to authenticated;
drop policy if exists shipment_tracking_events_admin_read on public.shipment_tracking_provider_events;
create policy shipment_tracking_events_admin_read
 on public.shipment_tracking_provider_events for select to authenticated
 using((select private.is_admin()));

create or replace function private.prepare_shipment_workflow_request(
 p_order_id uuid,p_intent_key uuid
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_stage jsonb; v_intent public.internal_label_intents%rowtype;
 v_req public.shipment_workflow_requests%rowtype; v_inserted boolean:=false;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administrador pode preparar solicitação' using errcode='42501';
 end if;
 if p_order_id is null or p_intent_key is null then
  raise exception 'Pedido e intenção obrigatórios';
 end if;
 -- Recalcula todos os dados do pedido (endereço, volumes, itens, serviço) com lock.
 v_stage:=private.stage_internal_label_intent(p_order_id);
 if coalesce((v_stage->>'changed')::boolean,true)
    or (v_stage->>'intent_key')::uuid is distinct from p_intent_key then
  raise exception 'A intenção foi alterada. Confira e registre novamente antes de solicitar';
 end if;
 select * into v_intent from public.internal_label_intents
 where order_id=p_order_id and intent_key=p_intent_key for update;
 if not found then raise exception 'Intenção inexistente'; end if;
 insert into public.shipment_workflow_requests(
  order_id,intent_key,source_fingerprint,provider,created_by
 ) values(
  p_order_id,p_intent_key,v_intent.source_fingerprint,v_intent.provider,auth.uid()
 )
 on conflict(order_id,intent_key) do nothing
 returning * into v_req;
 if found then
  v_inserted:=true;
  insert into public.shipment_internal_events(order_id,request_id,event_type,actor_id)
   values(p_order_id,v_req.id,'request_prepared',auth.uid());
  insert into public.order_events(order_id,event_type,note,actor_id)
   values(p_order_id,'note','Solicitação logística interna preparada; nenhuma etiqueta ou postagem gerada.',auth.uid());
 else
  select * into v_req from public.shipment_workflow_requests
   where order_id=p_order_id and intent_key=p_intent_key;
 end if;
 return jsonb_build_object(
  'id',v_req.id,'request_key',v_req.request_key,'status',v_req.status,
  'created',v_inserted,'external_request_performed',false,
  'shipment_purchased',false,'label_generated',false,'tracking_created',false
 );
end;
$$;
revoke all on function private.prepare_shipment_workflow_request(uuid,uuid)
 from public,anon,authenticated;
grant execute on function private.prepare_shipment_workflow_request(uuid,uuid) to authenticated;
create or replace function public.prepare_shipment_workflow_request(
 p_order_id uuid,p_intent_key uuid
) returns jsonb language sql security invoker set search_path=''
as $$select private.prepare_shipment_workflow_request(p_order_id,p_intent_key)$$;
revoke all on function public.prepare_shipment_workflow_request(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.prepare_shipment_workflow_request(uuid,uuid) to authenticated;

create or replace function private.void_internal_shipment_request(
 p_request_id uuid
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_request public.shipment_workflow_requests%rowtype; v_changed boolean:=false;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administrador pode descartar solicitação' using errcode='42501';
 end if;
 select * into v_request from public.shipment_workflow_requests
  where id=p_request_id for update;
 if not found then raise exception 'Solicitação não encontrada'; end if;
 if v_request.status='prepared_internal' then
  update public.shipment_workflow_requests
  set status='voided_internal',voided_at=now(),voided_by=auth.uid()
  where id=p_request_id;
  v_changed:=true;
  insert into public.shipment_internal_events(order_id,request_id,event_type,actor_id)
   values(v_request.order_id,v_request.id,'request_voided',auth.uid());
  insert into public.order_events(order_id,event_type,note,actor_id)
   values(v_request.order_id,'note','Solicitação logística interna descartada; não é cancelamento na transportadora.',auth.uid());
 end if;
 return jsonb_build_object('id',p_request_id,'status','voided_internal',
  'changed',v_changed,'provider_cancellation_performed',false,
  'shipment_purchased',false,'tracking_created',false);
end;
$$;
revoke all on function private.void_internal_shipment_request(uuid)
 from public,anon,authenticated;
grant execute on function private.void_internal_shipment_request(uuid) to authenticated;
create or replace function public.void_internal_shipment_request(p_request_id uuid)
 returns jsonb language sql security invoker set search_path=''
as $$select private.void_internal_shipment_request(p_request_id)$$;
revoke all on function public.void_internal_shipment_request(uuid)
 from public,anon,authenticated;
grant execute on function public.void_internal_shipment_request(uuid) to authenticated;

create or replace function private.log_internal_shipment_review(
 p_request_id uuid,p_review_type text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_request public.shipment_workflow_requests%rowtype; v_event uuid;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administrador pode registrar conferências' using errcode='42501';
 end if;
 if p_review_type not in ('address_reviewed','packages_reviewed',
   'fiscal_pending','carrier_pending') then
  raise exception 'Tipo de conferência inválido';
 end if;
 select * into v_request from public.shipment_workflow_requests
  where id=p_request_id for update;
 if not found or v_request.status<>'prepared_internal' then
  raise exception 'Solicitação indisponível para nova conferência';
 end if;
 insert into public.shipment_internal_events(order_id,request_id,event_type,actor_id)
  values(v_request.order_id,v_request.id,p_review_type,auth.uid())
  returning id into v_event;
 return jsonb_build_object('event_id',v_event,'review_type',p_review_type,
  'provider_event',false,'tracking_created',false);
end;
$$;
revoke all on function private.log_internal_shipment_review(uuid,text)
 from public,anon,authenticated;
grant execute on function private.log_internal_shipment_review(uuid,text) to authenticated;
create or replace function public.log_internal_shipment_review(
 p_request_id uuid,p_review_type text
) returns jsonb language sql security invoker set search_path=''
as $$select private.log_internal_shipment_review(p_request_id,p_review_type)$$;
revoke all on function public.log_internal_shipment_review(uuid,text)
 from public,anon,authenticated;
grant execute on function public.log_internal_shipment_review(uuid,text) to authenticated;
