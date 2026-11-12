-- Corrige ordem de bloqueio para evitar inversão pedido -> solicitação
-- em concorrência com preparação de remessas.
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