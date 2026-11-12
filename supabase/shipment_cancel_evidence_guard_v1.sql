-- Bloqueio de descarte interno quando já existem evidências do prestador.
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

-- Falha fechada: somente solicitações ativas podem receber PDFs oficiais
-- e eventos autenticados por um futuro adaptador privilegiado.
create or replace function private.guard_shipment_provider_evidence()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_order uuid;v_provider text;v_status text;
begin
 select order_id,provider,status into v_order,v_provider,v_status
 from public.shipment_workflow_requests where id=new.request_id for update;
 if not found or v_order is distinct from new.order_id
    or v_status is distinct from 'prepared_internal' then
  raise exception 'Evidência exige solicitação vigente e pedido correspondente';
 end if;
 if tg_table_name='shipment_tracking_provider_events'
    and new.provider is distinct from v_provider then
  raise exception 'Prestador do evento difere da solicitação';
 end if;
 return new;
end;
$$;
revoke all on function private.guard_shipment_provider_evidence() from public,anon,authenticated;

drop trigger if exists guard_shipment_doc_insert on public.shipment_provider_documents;
create trigger guard_shipment_doc_insert
 before insert or update on public.shipment_provider_documents
 for each row execute function private.guard_shipment_provider_evidence();

drop trigger if exists guard_shipment_tracking_insert on public.shipment_tracking_provider_events;
create trigger guard_shipment_tracking_insert
 before insert or update on public.shipment_tracking_provider_events
 for each row execute function private.guard_shipment_provider_evidence();
