-- Popê Beauty: checklist conservador de pré-contratação. NÃO libera compra.
-- Uma revisão por solicitação; as flags são atestações humanas e NÃO representam
-- documento fiscal autorizado ou tarifa comercial validada pelo provedor.
create table if not exists public.shipment_purchase_preflights (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique,
 order_id uuid not null,
 intent_key uuid not null,
 source_fingerprint text not null check(source_fingerprint ~ '^[a-f0-9]{64}$'),
 review_key uuid not null unique default gen_random_uuid(),
 recipient_checked boolean not null default false,
 packages_checked boolean not null default false,
 payment_checked boolean not null default false,
 fiscal_checked boolean not null default false,
 carrier_terms_checked boolean not null default false,
 checklist_complete_internal boolean generated always as (
  recipient_checked and packages_checked and payment_checked
  and fiscal_checked and carrier_terms_checked
 ) stored,
 review_notes text check(review_notes is null or char_length(review_notes)<=400),
 reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 foreign key(request_id,order_id) references public.shipment_workflow_requests(id,order_id)
  on delete cascade
);
create index if not exists shipment_purchase_preflights_order_idx
 on public.shipment_purchase_preflights(order_id,reviewed_at desc);
alter table public.shipment_purchase_preflights enable row level security;
revoke all on public.shipment_purchase_preflights from public,anon,authenticated;
grant select on public.shipment_purchase_preflights to authenticated;
drop policy if exists shipment_purchase_preflights_admin_read on public.shipment_purchase_preflights;
create policy shipment_purchase_preflights_admin_read
 on public.shipment_purchase_preflights for select to authenticated
 using((select private.is_admin()));

create or replace function private.save_shipment_purchase_preflight(
 p_request_id uuid,
 p_recipient_checked boolean,p_packages_checked boolean,
 p_payment_checked boolean,p_fiscal_checked boolean,
 p_carrier_terms_checked boolean,p_review_notes text default null
) returns jsonb language plpgsql security definer set search_path=''
as $$
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

 select * into v_request from public.shipment_workflow_requests
  where id=p_request_id for update;
 if not found or v_request.status<>'prepared_internal' then
  raise exception 'Solicitação não está em preparação interna';
 end if;

 -- A própria revalidação captura alterações em dados do pedido, origem,
 -- mercadorias, CEPs, volumes e versão do serviço. Um lock por pedido impede
 -- que a transação associe revisão nova a uma intenção obsoleta.
 v_stage:=private.stage_internal_label_intent(v_request.order_id);
 if coalesce((v_stage->>'changed')::boolean,true)
    or (v_stage->>'intent_key')::uuid is distinct from v_request.intent_key then
  raise exception 'Os dados da remessa mudaram. Registre nova intenção e nova solicitação';
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
$$;
revoke all on function private.save_shipment_purchase_preflight(
 uuid,boolean,boolean,boolean,boolean,boolean,text
) from public,anon,authenticated;
grant execute on function private.save_shipment_purchase_preflight(
 uuid,boolean,boolean,boolean,boolean,boolean,text
) to authenticated;
create or replace function public.save_shipment_purchase_preflight(
 p_request_id uuid,p_recipient_checked boolean,p_packages_checked boolean,
 p_payment_checked boolean,p_fiscal_checked boolean,
 p_carrier_terms_checked boolean,p_review_notes text default null
) returns jsonb language sql security invoker set search_path=''
as $$select private.save_shipment_purchase_preflight(
 p_request_id,p_recipient_checked,p_packages_checked,p_payment_checked,
 p_fiscal_checked,p_carrier_terms_checked,p_review_notes)$$;
revoke all on function public.save_shipment_purchase_preflight(
 uuid,boolean,boolean,boolean,boolean,boolean,text
) from public,anon,authenticated;
grant execute on function public.save_shipment_purchase_preflight(
 uuid,boolean,boolean,boolean,boolean,boolean,text
) to authenticated;

comment on table public.shipment_purchase_preflights is
 'Apenas checklist administrativo de preparação; complete_internal NÃO é autorização de compra, emissão fiscal, tarifa ou postagem.';
