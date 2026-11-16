-- Congela a intenção operacional, a guarda técnica e o checklist após o
-- registro de um plano. Uniformiza lock order. Não habilita compra externa.
CREATE OR REPLACE FUNCTION private.reserve_shipment_purchase_guard(p_request_id uuid, p_review_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_req public.shipment_workflow_requests%rowtype;
 v_intent public.internal_label_intents%rowtype;
 v_preflight public.shipment_purchase_preflights%rowtype;
 v_guard public.shipment_purchase_guards%rowtype;
 v_stage jsonb;
 v_updated boolean:=false;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administradores podem criar guardas técnicas'
   using errcode='42501';
 end if;
 if p_request_id is null or p_review_key is null then
  raise exception 'Solicitação e revisão obrigatórias';
 end if;
 select * into v_req from public.shipment_workflow_requests where id=p_request_id;
 if not found or v_req.status<>'prepared_internal' then
  raise exception 'Solicitação não está ativa';
 end if;
 -- Ordem de locks: pedido pela RPC de intenção, solicitação, checklist, guarda.
 v_stage:=private.stage_internal_label_intent(v_req.order_id);
 if coalesce((v_stage->>'changed')::boolean,true)
    or (v_stage->>'intent_key')::uuid is distinct from v_req.intent_key then
  raise exception 'A remessa foi alterada; atualize intenção e checklist antes de reservar';
 end if;
 select * into v_req from public.shipment_workflow_requests
  where id=p_request_id for update;
 if not found or v_req.status<>'prepared_internal'
    or v_req.intent_key is distinct from (v_stage->>'intent_key')::uuid then
  raise exception 'Solicitação indisponível ou substituída';
 end if;
 select * into v_intent from public.internal_label_intents
  where order_id=v_req.order_id and intent_key=v_req.intent_key;
 if not found or v_intent.source_fingerprint is distinct from v_req.source_fingerprint
    or v_intent.provider is distinct from v_req.provider then
  raise exception 'Fingerprint ou integrador da solicitação foi alterado';
 end if;
 select * into v_preflight from public.shipment_purchase_preflights
  where request_id=p_request_id for update;
 if not found or v_preflight.review_key is distinct from p_review_key
    or v_preflight.intent_key is distinct from v_req.intent_key
    or v_preflight.source_fingerprint is distinct from v_req.source_fingerprint
    or v_preflight.checklist_complete_internal is distinct from true then
  raise exception 'Checklist incompleto ou substituído. Realize nova conferência';
 end if;
 -- O bloqueio é por PEDIDO, não apenas pela solicitação vigente.
 -- Documentos e eventos antigos impedem gerar uma segunda chave com outra versão.
 if exists(select 1 from public.shipment_provider_documents
      where order_id=v_req.order_id)
    or exists(select 1 from public.shipment_tracking_provider_events
      where order_id=v_req.order_id)
    or exists(select 1 from public.shipment_cancellation_reviews
      where order_id=v_req.order_id and status='pending_internal_review') then
  raise exception 'Pedido já possui evidência externa ou cancelamento em revisão';
 end if;

 -- Só uma identidade de operação interna por pedido. Em caso de nova versão,
 -- a identidade é girada e a antiga fica inutilizável; nada é submetido a APIs.
 -- Não girar identidade de pedido depois de criar um plano de reconciliação.
 if exists(select 1 from public.shipment_provider_operation_plans op
  where op.order_id=v_req.order_id and (
   op.request_id is distinct from p_request_id
   or op.preflight_review_key is distinct from p_review_key
   or op.source_fingerprint is distinct from v_req.source_fingerprint
   or op.provider is distinct from v_req.provider
  )) then
  raise exception 'Plano de operação já registrado: identidade bloqueada para nova versão';
 end if;
 insert into public.shipment_purchase_guards(
  order_id,request_id,intent_key,source_fingerprint,preflight_review_key,
  guard_key,provider,status,created_by,updated_by
 ) values(
  v_req.order_id,p_request_id,v_req.intent_key,v_req.source_fingerprint,
  p_review_key,gen_random_uuid(),v_req.provider,
  'blocked_homologation',auth.uid(),auth.uid()
 )
 on conflict(order_id) do update set
  request_id=excluded.request_id,
  intent_key=excluded.intent_key,
  source_fingerprint=excluded.source_fingerprint,
  preflight_review_key=excluded.preflight_review_key,
  guard_key=gen_random_uuid(),
  guard_revision=public.shipment_purchase_guards.guard_revision+1,
  provider=excluded.provider,updated_by=auth.uid(),updated_at=now()
 where (public.shipment_purchase_guards.request_id,
        public.shipment_purchase_guards.intent_key,
        public.shipment_purchase_guards.source_fingerprint,
        public.shipment_purchase_guards.preflight_review_key,
        public.shipment_purchase_guards.provider)
   is distinct from
       (excluded.request_id,excluded.intent_key,excluded.source_fingerprint,
        excluded.preflight_review_key,excluded.provider)
 returning * into v_guard;

 if found then
  v_updated:=true;
  insert into public.order_events(order_id,event_type,note,actor_id)
  values(v_req.order_id,'note',
   'Chave técnica de controle interno de frete registrada ou atualizada. Compra bloqueada.',
   auth.uid());
 else
  select * into v_guard from public.shipment_purchase_guards
   where order_id=v_req.order_id;
 end if;

 return jsonb_build_object('guard_key',v_guard.guard_key,
  'guard_revision',v_guard.guard_revision,
  'changed',v_updated,'status','blocked_homologation',
  'external_request_performed',false,
  'shipment_purchased',false,'label_generated',false,
  'ready_for_label_purchase',false);
end;
$function$
;
CREATE OR REPLACE FUNCTION private.save_shipment_purchase_preflight(p_request_id uuid, p_recipient_checked boolean, p_packages_checked boolean, p_payment_checked boolean, p_fiscal_checked boolean, p_carrier_terms_checked boolean, p_review_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_request public.shipment_workflow_requests%rowtype;
 v_intent public.internal_label_intents%rowtype;
 v_stage jsonb;
 v_review public.shipment_purchase_preflights%rowtype;
 v_updated boolean:=false;
 v_note text:=nullif(btrim(coalesce(p_review_notes,'')),'');
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administradores podem registrar checklist de frete'
  using errcode='42501';
 end if;
 if p_request_id is null
    or p_recipient_checked is null or p_packages_checked is null
    or p_payment_checked is null or p_fiscal_checked is null
    or p_carrier_terms_checked is null or char_length(coalesce(v_note,''))>400 then
  raise exception 'Checklist de frete inválido';
 end if;

 -- Padronizar lock order com as outras RPCs de remessa: primeiro pedido,
 -- depois solicitação. Isso reduz chance de deadlock em ações simultâneas.
 select * into v_request from public.shipment_workflow_requests
  where id=p_request_id;
 if not found or v_request.status<>'prepared_internal' then
  raise exception 'Solicitação não está em preparação interna';
 end if;
 v_stage:=private.stage_internal_label_intent(v_request.order_id);
 if coalesce((v_stage->>'changed')::boolean,true)
    or (v_stage->>'intent_key')::uuid is distinct from v_request.intent_key then
  raise exception 'Os dados da remessa mudaram. Registre nova intenção e nova solicitação';
 end if;
 select * into v_request from public.shipment_workflow_requests
  where id=p_request_id for update;
 if not found or v_request.status<>'prepared_internal'
    or v_request.intent_key is distinct from (v_stage->>'intent_key')::uuid then
  raise exception 'A solicitação foi alterada durante a conferência';
 end if;
 select * into v_intent from public.internal_label_intents
  where order_id=v_request.order_id and intent_key=v_request.intent_key for update;
 if not found or v_intent.source_fingerprint is distinct from v_request.source_fingerprint
    or v_intent.provider is distinct from v_request.provider then
  raise exception 'A origem da solicitação foi substituída';
 end if;

 if exists(select 1 from public.shipment_provider_documents
    where request_id=p_request_id)
    or exists(select 1 from public.shipment_tracking_provider_events
    where request_id=p_request_id) then
  raise exception 'Já existe evidência externa; o checklist pré-compra não pode ser alterado';
 end if;
 if exists(select 1 from public.shipment_cancellation_reviews
    where request_id=p_request_id and status='pending_internal_review') then
  raise exception 'Existe revisão de cancelamento em andamento';
 end if;

 -- A marcação "fiscal" exige ao menos documentos cadastrais de preparação.
 -- Não verifica protocolo SEFAZ e não pode substituir a autorização da NF-e.
 if p_fiscal_checked and (
  not exists(select 1 from public.fiscal_order_drafts
    where order_id=v_request.order_id)
  or not exists(select 1 from public.fiscal_order_recipients
    where order_id=v_request.order_id)
  or not exists(select 1 from public.fiscal_issuer_settings where id=1)
 ) then
  raise exception 'Cadastre primeiro emitente, destinatário e rascunho fiscal';
 end if;

 -- Após criar um plano, o checklist é imutável. Repetir os mesmos campos
 -- continua idempotente e não altera a revisão.
 if exists(select 1 from public.shipment_provider_operation_plans
    where order_id=v_request.order_id)
  and not exists(select 1 from public.shipment_purchase_preflights pf
     where pf.request_id=p_request_id
      and pf.recipient_checked=p_recipient_checked
      and pf.packages_checked=p_packages_checked
      and pf.payment_checked=p_payment_checked
      and pf.fiscal_checked=p_fiscal_checked
      and pf.carrier_terms_checked=p_carrier_terms_checked
      and pf.review_notes is not distinct from v_note) then
  raise exception 'Checklist congelado após plano de operação; não altere uma preparação registrada';
 end if;
 insert into public.shipment_purchase_preflights(
  request_id,order_id,intent_key,source_fingerprint,
  recipient_checked,packages_checked,payment_checked,fiscal_checked,
  carrier_terms_checked,review_notes,reviewed_by
 ) values(
  p_request_id,v_request.order_id,v_request.intent_key,v_request.source_fingerprint,
  p_recipient_checked,p_packages_checked,p_payment_checked,p_fiscal_checked,
  p_carrier_terms_checked,v_note,auth.uid()
 )
 on conflict(request_id) do update
 set review_key=gen_random_uuid(),
  intent_key=excluded.intent_key,source_fingerprint=excluded.source_fingerprint,
  recipient_checked=excluded.recipient_checked,
  packages_checked=excluded.packages_checked,
  payment_checked=excluded.payment_checked,
  fiscal_checked=excluded.fiscal_checked,
  carrier_terms_checked=excluded.carrier_terms_checked,
  review_notes=excluded.review_notes,reviewed_by=auth.uid(),reviewed_at=now()
 where (
  public.shipment_purchase_preflights.intent_key,
  public.shipment_purchase_preflights.source_fingerprint,
  public.shipment_purchase_preflights.recipient_checked,
  public.shipment_purchase_preflights.packages_checked,
  public.shipment_purchase_preflights.payment_checked,
  public.shipment_purchase_preflights.fiscal_checked,
  public.shipment_purchase_preflights.carrier_terms_checked,
  public.shipment_purchase_preflights.review_notes
 ) is distinct from (
  excluded.intent_key,excluded.source_fingerprint,
  excluded.recipient_checked,excluded.packages_checked,
  excluded.payment_checked,excluded.fiscal_checked,
  excluded.carrier_terms_checked,excluded.review_notes
 )
 returning * into v_review;

 if found then
  v_updated:=true;
  insert into public.order_events(order_id,event_type,note,actor_id)
  values(v_request.order_id,'note',
   'Checklist interno de pré-contratação de frete revisado. Compra externa bloqueada.',
   auth.uid());
 else
  select * into v_review from public.shipment_purchase_preflights
   where request_id=p_request_id;
 end if;

 return jsonb_build_object(
  'id',v_review.id,'review_key',v_review.review_key,'changed',v_updated,
  'complete_internal',v_review.checklist_complete_internal,
  'shipment_purchased',false,'provider_request_performed',false,
  'ready_for_label_purchase',false,'fiscal_authorized',false
 );
end;
$function$
;
CREATE OR REPLACE FUNCTION private.void_internal_shipment_request(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_request public.shipment_workflow_requests%rowtype; v_changed boolean:=false;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administrador pode descartar solicitação' using errcode='42501';
 end if;
 select * into v_request from public.shipment_workflow_requests
  where id=p_request_id for update;
 if not found then raise exception 'Solicitação não encontrada'; end if;
 if v_request.status='prepared_internal' then
  if exists(select 1 from public.shipment_provider_operation_plans
    where order_id=v_request.order_id) then
   raise exception 'Existe plano operacional em auditoria. Não descarte a solicitação';
  end if;
  if exists(select 1 from public.shipment_provider_documents
      where request_id=p_request_id)
     or exists(select 1 from public.shipment_tracking_provider_events
      where request_id=p_request_id) then
   raise exception 'Solicitação possui evidências oficiais. Não é permitido descartar como preparação interna; confira o processo externo';
  end if;
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
$function$
;
CREATE OR REPLACE FUNCTION private.stage_shipment_provider_operation_plan(p_request_id uuid, p_guard_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 -- Mesma ordem de lock dos demais registros: pedido → solicitação →
 -- checklist → chave. Evita inversão com reserva de chave.
 select * into v_flight from public.shipment_purchase_preflights
  where request_id=p_request_id for update;
 if not found or v_flight.checklist_complete_internal is distinct from true
    or v_flight.source_fingerprint is distinct from v_req.source_fingerprint then
  raise exception 'Checklist inexistente, incompleto ou desatualizado';
 end if;
 select * into v_guard from public.shipment_purchase_guards
  where order_id=v_req.order_id for update;
 if not found or v_guard.guard_key is distinct from p_guard_key
    or v_guard.request_id is distinct from p_request_id
    or v_guard.status<>'blocked_homologation'
    or v_guard.source_fingerprint is distinct from v_req.source_fingerprint
    or v_guard.provider is distinct from v_req.provider
    or v_flight.review_key is distinct from v_guard.preflight_review_key then
  raise exception 'Guarda técnica ausente, substituída ou incompatível com o checklist';
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
$function$
;
