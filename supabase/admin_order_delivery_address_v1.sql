-- Popê Beauty: endereço de remessa administrativa, sem ativar checkout público.
-- Apenas pedidos manuais pagos/em separação e somente administradores.
create or replace function private.save_admin_order_delivery_address(
 p_order_id uuid,p_address jsonb
) returns boolean language plpgsql security definer set search_path=''
as $$
declare
 v_id uuid;
 v_recipient text := btrim(coalesce(p_address->>'recipient',''));
 v_phone text := btrim(coalesce(p_address->>'phone',''));
 v_zip text := btrim(coalesce(p_address->>'postal_code',''));
 v_street text := btrim(coalesce(p_address->>'street',''));
 v_number text := btrim(coalesce(p_address->>'house_number',''));
 v_complement text := btrim(coalesce(p_address->>'complement',''));
 v_district text := btrim(coalesce(p_address->>'district',''));
 v_city text := btrim(coalesce(p_address->>'city',''));
 v_state text := upper(btrim(coalesce(p_address->>'state_code','')));
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Acesso exclusivo a administradores' using errcode='42501';
 end if;
 if p_order_id is null or jsonb_typeof(p_address) is distinct from 'object' then
  raise exception 'Dados de entrega inválidos';
 end if;
 if char_length(v_recipient) not between 2 and 160
  or v_phone !~ '^([0-9]{10}|[0-9]{11})$'
  or v_zip !~ '^[0-9]{8}$'
  or char_length(v_street) not between 2 and 160
  or char_length(v_number) not between 1 and 30
  or char_length(v_complement)>120
  or char_length(v_district) not between 2 and 100
  or char_length(v_city) not between 2 and 100
  or v_state !~ '^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$' then
  raise exception 'Destinatário, CEP, telefone ou endereço incompletos';
 end if;
 update public.orders
 set shipping_address_snapshot=jsonb_build_object(
  'recipient',v_recipient,'phone',v_phone,'postal_code',v_zip,
  'street',v_street,'house_number',v_number,
  'complement',nullif(v_complement,''),'district',v_district,
  'city',v_city,'state_code',v_state),
  updated_at=now()
 where id=p_order_id and origin='admin_manual' and status in ('paid','packing')
 returning id into v_id;
 if v_id is null then
  raise exception 'Pedido não autorizado para alteração de endereço antes do despacho';
 end if;
 insert into public.order_events(order_id,event_type,note,actor_id)
 values(v_id,'note','Endereço de entrega atualizado para preparação interna de remessa.',auth.uid());
 return true;
end;
$$;
revoke all on function private.save_admin_order_delivery_address(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.save_admin_order_delivery_address(uuid,jsonb) to authenticated;
create or replace function public.save_admin_order_delivery_address(
 p_order_id uuid,p_address jsonb
) returns boolean language sql security invoker set search_path=''
as $$select private.save_admin_order_delivery_address(p_order_id,p_address)$$;
revoke all on function public.save_admin_order_delivery_address(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_admin_order_delivery_address(uuid,jsonb) to authenticated;
