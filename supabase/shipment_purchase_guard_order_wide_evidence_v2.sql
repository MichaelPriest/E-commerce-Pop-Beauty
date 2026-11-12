-- Impede a segunda identidade técnica de compra mesmo após troca da intenção
-- quando já há documentos, rastreio ou cancelamento em análise no pedido.
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