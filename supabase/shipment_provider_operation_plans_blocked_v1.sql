-- Popê Beauty: plano técnico de operação/logística, SEM despacho externo.
-- Deliberadamente NÃO existe estado purchased/sent nem referências oficiais.
create table public.shipment_provider_operation_plans (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null unique references public.orders(id) on delete cascade,
 request_id uuid not null unique,
 guard_key uuid not null unique,
 preflight_review_key uuid not null,
 source_fingerprint text not null check(source_fingerprint ~ '^[a-f0-9]{64}$'),
 provider text not null check(provider in ('melhor_envio','correios')),
 state text not null default 'blocked_no_dispatch'
   check(state in ('blocked_no_dispatch','internal_review_required','archived_internal')),
 review_reason text check(review_reason is null or review_reason in (
  'integration_pending','configuration_review','duplicate_risk','timeout_policy_review','other'
 )),
 review_notes text check(review_notes is null or char_length(review_notes)<=300),
 external_dispatch_count integer not null default 0 check(external_dispatch_count=0),
 external_order_id text check(external_order_id is null),
 purchase_confirmed_at timestamptz check(purchase_confirmed_at is null),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 created_by uuid references auth.users(id) on delete set null,
 updated_by uuid references auth.users(id) on delete set null,
 foreign key(request_id,order_id)
   references public.shipment_workflow_requests(id,order_id) on delete cascade,
 constraint operation_plan_review_state check (
  (state='blocked_no_dispatch' and review_reason is null)
  or (state in ('internal_review_required','archived_internal') and review_reason is not null)
 )
);
create index shipment_provider_operation_plan_state_idx
 on public.shipment_provider_operation_plans(state,updated_at desc);
alter table public.shipment_provider_operation_plans enable row level security;
revoke all on public.shipment_provider_operation_plans from public,anon,authenticated;
grant select on public.shipment_provider_operation_plans to authenticated;
create policy shipment_operation_plans_admin_read
 on public.shipment_provider_operation_plans for select to authenticated
 using((select private.is_admin()));

create table public.shipment_operation_plan_events (
 id uuid primary key default gen_random_uuid(),
 plan_id uuid not null references public.shipment_provider_operation_plans(id) on delete cascade,
 order_id uuid not null references public.orders(id) on delete cascade,
 event_type text not null check(event_type in (
   'plan_created_internal','review_requested_internal','review_archived_internal'
 )),
 event_reason text check(event_reason is null or event_reason in (
  'integration_pending','configuration_review','duplicate_risk','timeout_policy_review','other'
 )),
 actor_id uuid references auth.users(id) on delete set null,
 occurred_at timestamptz not null default now(),
 external_request_performed boolean not null default false
  check(external_request_performed=false)
);
create index shipment_operation_plan_events_plan_idx
 on public.shipment_operation_plan_events(plan_id,occurred_at desc);
alter table public.shipment_operation_plan_events enable row level security;
revoke all on public.shipment_operation_plan_events from public,anon,authenticated;
grant select on public.shipment_operation_plan_events to authenticated;
create policy shipment_operation_events_admin_read
 on public.shipment_operation_plan_events for select to authenticated
 using((select private.is_admin()));

create or replace function private.stage_shipment_provider_operation_plan(
 p_request_id uuid,p_guard_key uuid
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_req public.shipment_workflow_requests%rowtype;
 v_guard public.shipment_purchase_guards%rowtype;
 v_flight public.shipment_purchase_preflights%rowtype;
 v_intent public.internal_label_intents%rowtype;
 v_stage jsonb;
 v_plan public.shipment_provider_operation_plans%rowtype;
 v_created boolean:=false;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Plano logístico restrito à administração' using errcode='42501';
 end if;
 if p_request_id is null or p_guard_key is null then
  raise exception 'Solicitação e chave técnica são obrigatórias';
 end if;
 -- Lock de pedido primeiro, via revalidação da intenção, igual às RPCs anteriores.
 select * into v_req from public.shipment_workflow_requests
  where id=p_request_id;
 if not found or v_req.status<>'prepared_internal' then
  raise exception 'Solicitação não está em preparação interna';
 end if;
 v_stage:=private.stage_internal_label_intent(v_req.order_id);
 if coalesce((v_stage->>'changed')::boolean,true)
    or (v_stage->>'intent_key')::uuid is distinct from v_req.intent_key then
  raise exception 'Dados do pedido alterados: recrie intenção, conferência e guarda';
 end if;
 select * into v_req from public.shipment_workflow_requests
  where id=p_request_id for update;
 if not found or v_req.status<>'prepared_internal'
    or v_req.intent_key is distinct from (v_stage->>'intent_key')::uuid then
  raise exception 'Solicitação alterada durante revisão';
 end if;
 select * into v_guard from public.shipment_purchase_guards
  where order_id=v_req.order_id for update;
 if not found or v_guard.guard_key is distinct from p_guard_key
    or v_guard.request_id is distinct from p_request_id
    or v_guard.status<>'blocked_homologation'
    or v_guard.source_fingerprint is distinct from v_req.source_fingerprint
    or v_guard.provider is distinct from v_req.provider then
  raise exception 'Chave técnica ausente, substituída ou inválida';
 end if;
 select * into v_flight from public.shipment_purchase_preflights
  where request_id=p_request_id for update;
 if not found or v_flight.review_key is distinct from v_guard.preflight_review_key
    or v_flight.checklist_complete_internal is distinct from true
    or v_flight.source_fingerprint is distinct from v_req.source_fingerprint then
  raise exception 'Checklist não corresponde à chave técnica';
 end if;
 select * into v_intent from public.internal_label_intents
  where order_id=v_req.order_id;
 if not found or v_intent.intent_key is distinct from v_req.intent_key
    or v_intent.source_fingerprint is distinct from v_req.source_fingerprint then
  raise exception 'Intenção vigente incompatível';
 end if;
 if exists(select 1 from public.shipment_provider_documents where order_id=v_req.order_id)
  or exists(select 1 from public.shipment_tracking_provider_events where order_id=v_req.order_id)
  or exists(select 1 from public.shipment_cancellation_reviews
      where order_id=v_req.order_id and status='pending_internal_review') then
  raise exception 'Evidência externa ou cancelamento pendente exige conferência antes do plano';
 end if;
 -- Apenas 1 plano por pedido; uma troca de guarda NÃO cria outro plano.
 insert into public.shipment_provider_operation_plans(
  order_id,request_id,guard_key,preflight_review_key,
  source_fingerprint,provider,created_by,updated_by
 ) values(
  v_req.order_id,p_request_id,p_guard_key,v_guard.preflight_review_key,
  v_req.source_fingerprint,v_req.provider,auth.uid(),auth.uid()
 )
 on conflict(order_id) do nothing returning * into v_plan;
 if found then
  v_created:=true;
  insert into public.shipment_operation_plan_events(
   plan_id,order_id,event_type,actor_id
  ) values(v_plan.id,v_plan.order_id,'plan_created_internal',auth.uid());
 else
  select * into v_plan from public.shipment_provider_operation_plans
   where order_id=v_req.order_id for update;
  if not found or v_plan.request_id is distinct from p_request_id
    or v_plan.guard_key is distinct from p_guard_key then
   raise exception 'Já existe plano associado a outra versão; não é permitido duplicar';
  end if;
 end if;
 return jsonb_build_object(
  'plan_id',v_plan.id,'state',v_plan.state,'created',v_created,
  'external_dispatch_count',0,'external_request_performed',false,
  'shipment_purchased',false,'label_generated',false,
  'safe_to_retry_purchase',false
 );
end;
$$;
revoke all on function private.stage_shipment_provider_operation_plan(uuid,uuid)
 from public,anon,authenticated;
grant execute on function private.stage_shipment_provider_operation_plan(uuid,uuid)
 to authenticated;
create or replace function public.stage_shipment_provider_operation_plan(
 p_request_id uuid,p_guard_key uuid
) returns jsonb language sql security invoker set search_path=''
as $$select private.stage_shipment_provider_operation_plan(p_request_id,p_guard_key)$$;
revoke all on function public.stage_shipment_provider_operation_plan(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.stage_shipment_provider_operation_plan(uuid,uuid)
 to authenticated;

create or replace function private.review_shipment_provider_operation_plan(
 p_plan_id uuid,p_reason text,p_notes text default null
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_plan public.shipment_provider_operation_plans%rowtype;
 v_note text:=nullif(btrim(coalesce(p_notes,'')),'');
 v_changed boolean:=false;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Revisão logística restrita à administração' using errcode='42501';
 end if;
 if p_plan_id is null or p_reason not in (
  'integration_pending','configuration_review','duplicate_risk','timeout_policy_review','other'
 ) or char_length(coalesce(v_note,''))>300 then
  raise exception 'Motivo de conferência inválido';
 end if;
 select * into v_plan from public.shipment_provider_operation_plans
  where id=p_plan_id for update;
 if not found then raise exception 'Plano não localizado';end if;
 if v_plan.state='archived_internal' then
  raise exception 'Plano arquivado é imutável';
 end if;
 if v_plan.state<>'internal_review_required'
  or v_plan.review_reason is distinct from p_reason
  or v_plan.review_notes is distinct from v_note then
  update public.shipment_provider_operation_plans
   set state='internal_review_required',review_reason=p_reason,
    review_notes=v_note,updated_by=auth.uid(),updated_at=now()
   where id=p_plan_id;
  insert into public.shipment_operation_plan_events(
   plan_id,order_id,event_type,event_reason,actor_id
  ) values(p_plan_id,v_plan.order_id,'review_requested_internal',p_reason,auth.uid());
  v_changed:=true;
 end if;
 return jsonb_build_object('plan_id',p_plan_id,'state','internal_review_required',
  'changed',v_changed,'external_request_performed',false,
  'shipment_purchased',false,'safe_to_retry_purchase',false);
end;
$$;
revoke all on function private.review_shipment_provider_operation_plan(uuid,text,text)
 from public,anon,authenticated;
grant execute on function private.review_shipment_provider_operation_plan(uuid,text,text)
 to authenticated;
create or replace function public.review_shipment_provider_operation_plan(
 p_plan_id uuid,p_reason text,p_notes text default null
) returns jsonb language sql security invoker set search_path=''
as $$select private.review_shipment_provider_operation_plan(
 p_plan_id,p_reason,p_notes)$$;
revoke all on function public.review_shipment_provider_operation_plan(uuid,text,text)
 from public,anon,authenticated;
grant execute on function public.review_shipment_provider_operation_plan(uuid,text,text)
 to authenticated;

create or replace function private.archive_shipment_provider_operation_plan(
 p_plan_id uuid
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_plan public.shipment_provider_operation_plans%rowtype;
 v_changed boolean:=false;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Arquivamento restrito à administração' using errcode='42501';
 end if;
 select * into v_plan from public.shipment_provider_operation_plans
  where id=p_plan_id for update;
 if not found then raise exception 'Plano não localizado';end if;
 if v_plan.state='blocked_no_dispatch' then
  raise exception 'Solicite uma revisão interna antes de arquivar o plano';
 end if;
 if v_plan.state='internal_review_required' then
  update public.shipment_provider_operation_plans
   set state='archived_internal',updated_by=auth.uid(),updated_at=now()
   where id=p_plan_id;
  insert into public.shipment_operation_plan_events(
   plan_id,order_id,event_type,event_reason,actor_id
  ) values(p_plan_id,v_plan.order_id,'review_archived_internal',
   v_plan.review_reason,auth.uid());
  v_changed:=true;
 end if;
 return jsonb_build_object('plan_id',p_plan_id,'state','archived_internal',
  'changed',v_changed,'external_request_performed',false,
  'shipment_purchased',false,'safe_to_retry_purchase',false);
end;
$$;
revoke all on function private.archive_shipment_provider_operation_plan(uuid)
 from public,anon,authenticated;
grant execute on function private.archive_shipment_provider_operation_plan(uuid)
 to authenticated;
create or replace function public.archive_shipment_provider_operation_plan(
 p_plan_id uuid
) returns jsonb language sql security invoker set search_path=''
as $$select private.archive_shipment_provider_operation_plan(p_plan_id)$$;
revoke all on function public.archive_shipment_provider_operation_plan(uuid)
 from public,anon,authenticated;
grant execute on function public.archive_shipment_provider_operation_plan(uuid)
 to authenticated;

comment on table public.shipment_provider_operation_plans is
 'Plano técnico SEM CHAMADA EXTERNA. 0 despachos por CHECK; nenhuma prova de compra, etiqueta, rastreio ou idempotência comercial.';
