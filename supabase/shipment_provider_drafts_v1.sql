-- Rascunhos de transportadora sem compra, etiquetas ou rastreio externo.
create table if not exists public.shipment_provider_drafts (
 order_id uuid primary key references public.orders(id) on delete cascade,
 provider text not null check(provider in ('melhor_envio','correios')),
 service_code text check(service_code is null or service_code ~ '^[A-Za-z0-9._-]{1,40}$'),
 operator_notes text check(operator_notes is null or char_length(operator_notes)<=400),
 status text not null default 'draft' check(status='draft'),
 revision integer not null default 1 check(revision>=1),
 draft_token uuid not null default gen_random_uuid() unique,
 created_by uuid references auth.users(id) on delete set null,
 updated_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.shipment_provider_drafts enable row level security;
revoke all on table public.shipment_provider_drafts from public,anon,authenticated;
grant select on table public.shipment_provider_drafts to authenticated;
drop policy if exists "shipment_draft_admin_read" on public.shipment_provider_drafts;
create policy "shipment_draft_admin_read" on public.shipment_provider_drafts
 for select to authenticated using((select private.is_admin()));

create or replace function private.save_shipment_provider_draft(
 p_order_id uuid,p_provider text,p_service_code text,p_notes text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_service text := nullif(btrim(p_service_code),'');
 v_notes text := nullif(btrim(p_notes),'');
 v_revision integer;
 v_token uuid;
 v_changed boolean := false;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administradores podem preparar remessas' using errcode='42501';
 end if;
 if p_order_id is null or p_provider is null or
    p_provider not in ('melhor_envio','correios') or
    (v_service is not null and v_service !~ '^[A-Za-z0-9._-]{1,40}$') or
    char_length(coalesce(v_notes,''))>400 then
  raise exception 'Transportadora, código de serviço ou observação inválidos';
 end if;
 perform 1 from public.orders
  where id=p_order_id and origin='admin_manual' and status in ('paid','packing')
  for update;
 if not found then
  raise exception 'Somente pedidos internos pagos ou em separação podem ter remessa preparada';
 end if;
 insert into public.shipment_provider_drafts
  (order_id,provider,service_code,operator_notes,status,revision,
   draft_token,created_by,updated_by,created_at,updated_at)
 values (p_order_id,p_provider,v_service,v_notes,'draft',1,
         gen_random_uuid(),auth.uid(),auth.uid(),now(),now())
 on conflict(order_id) do update set
   provider=excluded.provider,
   service_code=excluded.service_code,
   operator_notes=excluded.operator_notes,
   revision=public.shipment_provider_drafts.revision+1,
   draft_token=gen_random_uuid(),
   updated_by=auth.uid(),
   updated_at=now()
 where (public.shipment_provider_drafts.provider,
        public.shipment_provider_drafts.service_code,
        public.shipment_provider_drafts.operator_notes)
       is distinct from
       (excluded.provider,excluded.service_code,excluded.operator_notes)
 returning revision,draft_token into v_revision,v_token;
 if v_revision is not null then
  v_changed := true;
  insert into public.order_events(order_id,event_type,note,actor_id)
  values(p_order_id,'note','Configuração interna de transportadora atualizada; sem compra de frete.',auth.uid());
 else
  select revision,draft_token into v_revision,v_token
  from public.shipment_provider_drafts where order_id=p_order_id;
 end if;
 return jsonb_build_object('saved',true,'changed',v_changed,
   'revision',v_revision,'draft_token',v_token,
   'provider_request_performed',false,'shipment_purchased',false);
end;
$$;
revoke all on function private.save_shipment_provider_draft(uuid,text,text,text)
 from public,anon,authenticated;
grant execute on function private.save_shipment_provider_draft(uuid,text,text,text)
 to authenticated;
create or replace function public.save_shipment_provider_draft(
 p_order_id uuid,p_provider text,p_service_code text,p_notes text
) returns jsonb language sql security invoker set search_path=''
as $$ select private.save_shipment_provider_draft(p_order_id,p_provider,p_service_code,p_notes) $$;
revoke all on function public.save_shipment_provider_draft(uuid,text,text,text)
 from public,anon,authenticated;
grant execute on function public.save_shipment_provider_draft(uuid,text,text,text)
 to authenticated;
comment on table public.shipment_provider_drafts is
 'Configuração e versão administrativa de remessa. Rascunho sem chamadas a APIs, custos, etiqueta ou rastreio.';
