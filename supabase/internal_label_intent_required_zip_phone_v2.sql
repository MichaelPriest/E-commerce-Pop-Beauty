CREATE OR REPLACE FUNCTION private.stage_internal_label_intent(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_order record;
 v_draft record;
 v_origin text;
 v_count integer;
 v_registered integer;
 v_packages jsonb;
 v_fingerprint text;
 v_key uuid;
 v_changed boolean := false;
 v_address jsonb;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administradores podem registrar intenções internas' using errcode='42501';
 end if;
 if p_order_id is null then raise exception 'Pedido obrigatório'; end if;

 select origin,status,shipping_address_snapshot into v_order
 from public.orders where id=p_order_id for update;
 if not found or v_order.origin is distinct from 'admin_manual'
    or v_order.status not in ('paid','packing') then
  raise exception 'Pedido não elegível: precisa estar pago ou em separação';
 end if;
 v_address:=v_order.shipping_address_snapshot;
 if jsonb_typeof(v_address) is distinct from 'object'
    or char_length(btrim(coalesce(v_address->>'recipient','')))<2
    or coalesce(v_address->>'phone','') !~ '^([0-9]{10}|[0-9]{11})$'
    or coalesce(v_address->>'postal_code','') !~ '^[0-9]{8}$'
    or char_length(btrim(coalesce(v_address->>'street','')))<2
    or char_length(btrim(coalesce(v_address->>'house_number','')))<1
    or char_length(btrim(coalesce(v_address->>'district','')))<2
    or char_length(btrim(coalesce(v_address->>'city','')))<2
    or upper(btrim(coalesce(v_address->>'state_code',''))) !~
       '^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$'
 then
  raise exception 'Destinatário e endereço completos são obrigatórios';
 end if;

 select provider,service_code,revision,draft_token into v_draft
 from public.shipment_provider_drafts where order_id=p_order_id for update;
 if not found or v_draft.provider not in ('melhor_envio','correios')
    or v_draft.service_code is null
    or v_draft.service_code !~ '^[A-Za-z0-9._-]{1,40}$' then
  raise exception 'Salve a transportadora e o serviço de referência antes de continuar';
 end if;

 select btrim(origin_postal_code) into v_origin
 from public.shipping_origin_settings where id=1;
 if v_origin is null or v_origin !~ '^[0-9]{8}$' then
  raise exception 'CEP de origem não configurado';
 end if;

 select volumes into v_count
 from public.internal_package_preparations where order_id=p_order_id;
 if v_count is null or v_count not between 1 and 50 then
  raise exception 'Quantidade prevista de volumes inválida';
 end if;

 select count(*)::integer,
   coalesce(jsonb_agg(jsonb_build_object(
    'n',volume_number,'weight_g',weight_g,'h',height_cm,
    'w',width_cm,'l',length_cm,'note',contents_note
   ) order by volume_number),'[]'::jsonb)
 into v_registered,v_packages from public.internal_package_volumes
 where order_id=p_order_id;
 if v_registered<>v_count
    or exists(select 1 from public.internal_package_volumes
      where order_id=p_order_id and (volume_number not between 1 and v_count
        or weight_g not between 1 and 500000
        or height_cm<=0 or width_cm<=0 or length_cm<=0)) then
  raise exception 'Volumes faltantes, excedentes ou inválidos';
 end if;
 -- PK (order_id,volume_number), valores 1..N e contagem N asseguram sequência completa.

 v_fingerprint:=encode(sha256(convert_to(jsonb_build_object(
  'order_id',p_order_id,'address',v_address,'origin_zip',v_origin,
  'package_count',v_count,'packages',v_packages,
  'provider',v_draft.provider,'service',v_draft.service_code,
  'draft_revision',v_draft.revision,'draft_token',v_draft.draft_token
 )::text,'UTF8')),'hex');

 insert into public.internal_label_intents
  (order_id,intent_key,provider,service_code,draft_revision,draft_token,
   source_fingerprint,status,created_by,updated_by,created_at,updated_at)
 values(p_order_id,gen_random_uuid(),v_draft.provider,v_draft.service_code,
   v_draft.revision,v_draft.draft_token,v_fingerprint,'prepared_internal',
   auth.uid(),auth.uid(),now(),now())
 on conflict(order_id) do update
 set intent_key=gen_random_uuid(),provider=excluded.provider,
     service_code=excluded.service_code,draft_revision=excluded.draft_revision,
     draft_token=excluded.draft_token,source_fingerprint=excluded.source_fingerprint,
     status='prepared_internal',updated_by=auth.uid(),updated_at=now()
 where public.internal_label_intents.source_fingerprint is distinct from excluded.source_fingerprint
 returning intent_key into v_key;

 if v_key is not null then
  v_changed:=true;
  insert into public.order_events(order_id,event_type,note,actor_id)
  values(p_order_id,'note','Intenção interna de etiqueta atualizada. Nenhuma remessa foi contratada.',auth.uid());
 else
  select intent_key into v_key from public.internal_label_intents where order_id=p_order_id;
 end if;

 return jsonb_build_object('recorded',true,'changed',v_changed,
   'intent_key',v_key,'provider',v_draft.provider,
   'label_generated',false,'shipment_purchased',false,
   'external_request_performed',false,'ready_for_label_purchase',false);
end;
$function$
;
