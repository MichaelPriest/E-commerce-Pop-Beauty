-- Abertura de revisão administrativa de cancelamento, sem ação no provedor.
create table public.shipment_cancellation_reviews (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique,
 order_id uuid not null,
 reason_code text not null check(reason_code in (
  'customer_request','address_correction','carrier_problem','duplicate_request','other'
 )),
 review_notes text check(review_notes is null or char_length(review_notes)<=300),
 status text not null default 'pending_internal_review'
  check(status in ('pending_internal_review','dismissed_internal')),
 requested_by uuid references auth.users(id) on delete set null,
 requested_at timestamptz not null default now(),
 dismissed_by uuid references auth.users(id) on delete set null,
 dismissed_at timestamptz,
 foreign key(request_id,order_id)
  references public.shipment_workflow_requests(id,order_id) on delete cascade,
 constraint cancellation_review_dismiss_state check(
  (status='pending_internal_review' and dismissed_at is null)
  or (status='dismissed_internal' and dismissed_at is not null)
 )
);
create index shipment_cancellation_reviews_order_time
 on public.shipment_cancellation_reviews(order_id,requested_at desc);
alter table public.shipment_cancellation_reviews enable row level security;
revoke all on public.shipment_cancellation_reviews from public,anon,authenticated;
grant select on public.shipment_cancellation_reviews to authenticated;
create policy shipment_cancellation_reviews_admin_read
 on public.shipment_cancellation_reviews for select to authenticated
 using((select private.is_admin()));

create or replace function private.open_shipment_cancellation_review(
 p_request_id uuid,p_reason_code text,p_review_notes text default null
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_req public.shipment_workflow_requests%rowtype;
 v_review public.shipment_cancellation_reviews%rowtype;
 v_new boolean:=false;
 v_note text:=nullif(btrim(coalesce(p_review_notes,'')),'');
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administrador pode solicitar revisão de cancelamento' using errcode='42501';
 end if;
 if p_request_id is null or p_reason_code not in
  ('customer_request','address_correction','carrier_problem','duplicate_request','other')
  or char_length(coalesce(v_note,''))>300 then
  raise exception 'Motivo de revisão inválido';
 end if;
 select * into v_req from public.shipment_workflow_requests
  where id=p_request_id for update;
 if not found or v_req.status<>'prepared_internal' then
  raise exception 'Solicitação interna indisponível';
 end if;
 -- Não permitir tickets de cancelamento fictícios para preparações sem etiqueta
 -- ou ocorrência autenticada vinculada.
 if not exists(select 1 from public.shipment_provider_documents where request_id=p_request_id)
    and not exists(select 1 from public.shipment_tracking_provider_events where request_id=p_request_id) then
  raise exception 'Não há documento ou evento oficial que justifique revisão de cancelamento';
 end if;
 insert into public.shipment_cancellation_reviews(
  request_id,order_id,reason_code,review_notes,requested_by
 ) values(p_request_id,v_req.order_id,p_reason_code,v_note,auth.uid())
 on conflict(request_id) do nothing
 returning * into v_review;
 if found then
  v_new:=true;
  insert into public.order_events(order_id,event_type,note,actor_id)
  values(v_req.order_id,'note','Revisão interna de cancelamento aberta. Nenhuma solicitação foi enviada ao provedor.',auth.uid());
 else
  select * into v_review from public.shipment_cancellation_reviews where request_id=p_request_id;
 end if;
 return jsonb_build_object('review_id',v_review.id,'status',v_review.status,
  'created',v_new,'provider_cancellation_requested',false,
  'refund_performed',false,'shipment_status_changed',false);
end;
$$;
revoke all on function private.open_shipment_cancellation_review(uuid,text,text)
 from public,anon,authenticated;
grant execute on function private.open_shipment_cancellation_review(uuid,text,text)
 to authenticated;
create or replace function public.open_shipment_cancellation_review(
 p_request_id uuid,p_reason_code text,p_review_notes text default null
) returns jsonb language sql security invoker set search_path=''
as $$select private.open_shipment_cancellation_review(
 p_request_id,p_reason_code,p_review_notes)$$;
revoke all on function public.open_shipment_cancellation_review(uuid,text,text)
 from public,anon,authenticated;
grant execute on function public.open_shipment_cancellation_review(uuid,text,text)
 to authenticated;

create or replace function private.dismiss_shipment_cancellation_review(
 p_review_id uuid
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_review public.shipment_cancellation_reviews%rowtype;v_changed boolean:=false;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administrador pode encerrar revisão interna' using errcode='42501';
 end if;
 select * into v_review from public.shipment_cancellation_reviews
  where id=p_review_id for update;
 if not found then raise exception 'Revisão não encontrada';end if;
 if v_review.status='pending_internal_review' then
  update public.shipment_cancellation_reviews
  set status='dismissed_internal',dismissed_at=now(),dismissed_by=auth.uid()
  where id=p_review_id;
  v_changed:=true;
  insert into public.order_events(order_id,event_type,note,actor_id)
  values(v_review.order_id,'note','Revisão interna encerrada sem cancelar na transportadora.',auth.uid());
 end if;
 return jsonb_build_object('review_id',p_review_id,'status','dismissed_internal',
  'changed',v_changed,'provider_cancellation_performed',false,
  'refund_performed',false);
end;
$$;
revoke all on function private.dismiss_shipment_cancellation_review(uuid)
 from public,anon,authenticated;
grant execute on function private.dismiss_shipment_cancellation_review(uuid)
 to authenticated;
create or replace function public.dismiss_shipment_cancellation_review(p_review_id uuid)
 returns jsonb language sql security invoker set search_path=''
as $$select private.dismiss_shipment_cancellation_review(p_review_id)$$;
revoke all on function public.dismiss_shipment_cancellation_review(uuid)
 from public,anon,authenticated;
grant execute on function public.dismiss_shipment_cancellation_review(uuid)
 to authenticated;
