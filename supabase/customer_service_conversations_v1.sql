-- Conversas de atendimento Popê. Uma mensagem não movimenta pedidos, pagamentos ou estoque.
-- Aplicar depois de customer_service_requests_v1 e customer_service_performance_v1.
begin;

create table public.customer_service_messages (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.customer_service_requests(id) on delete cascade,
 author_id uuid references auth.users(id) on delete set null,
 author_role text not null check (author_role in ('customer','staff')),
 body text not null check (length(btrim(body)) between 5 and 2000),
 created_at timestamptz not null default clock_timestamp()
);
create index customer_service_messages_thread_idx
 on public.customer_service_messages(request_id,created_at desc,id desc);
create index customer_service_messages_author_limit_idx
 on public.customer_service_messages(author_id,created_at desc);

alter table public.customer_service_messages enable row level security;
revoke all on public.customer_service_messages from public,anon,authenticated;
grant select on public.customer_service_messages to authenticated;
create policy customer_service_messages_owner_staff_read
 on public.customer_service_messages for select to authenticated
 using (
  (select private.is_admin()) or exists(
   select 1 from public.customer_service_requests r
   where r.id=request_id and r.user_id=(select auth.uid())
  )
 );
-- Proibido INSERT/UPDATE/DELETE direto do navegador; o envio usa uma RPC autorizada.
-- Ajusta o gatilho legado: uma nova resposta do cliente não o transforma no avaliador.
create or replace function private.guard_customer_service_request()
returns trigger language plpgsql set search_path=''
as $$
begin
 if TG_OP='INSERT' then
  if new.user_id is distinct from auth.uid() then
   raise exception 'Somente o titular pode solicitar atendimento'
    using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
  if (select count(*) from public.customer_service_requests
   where user_id=new.user_id and created_at>clock_timestamp()-interval '1 hour')>=3 then
   raise exception 'Limite de três solicitações por hora atingido';
  end if;
  return new;
 end if;
 new.updated_at=clock_timestamp();
 if private.is_admin() then
  new.reviewed_by=auth.uid();
 end if;
 return new;
end;
$$;

create function public.post_service_message(p_request_id uuid,p_body text)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
 v_user uuid:=auth.uid();
 v_staff boolean;
 v_request public.customer_service_requests%rowtype;
 v_message public.customer_service_messages%rowtype;
 v_text text;
 v_status text;
begin
 if v_user is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
  raise exception 'Entre em uma conta verificada para continuar' using errcode='42501';
 end if;
 v_staff:=private.is_admin();
 v_text:=btrim(coalesce(p_body,''));
 if p_request_id is null or length(v_text) not between 5 and 2000
    or (v_staff and length(v_text) not between 10 and 1200) then
  raise exception 'A mensagem deve ter entre % e % caracteres',
   case when v_staff then 10 else 5 end,
   case when v_staff then 1200 else 2000 end
   using errcode='22023';
 end if;
 -- Limita mensagens em múltiplos chamados abertos pelo mesmo titular.
 perform pg_advisory_xact_lock(hashtextextended('support-message:'||v_user::text,0));
 select * into v_request from public.customer_service_requests
  where id=p_request_id for update;
 if not found or (not v_staff and v_request.user_id is distinct from v_user) then
  raise exception 'Atendimento indisponível' using errcode='42501';
 end if;
 if v_request.status='closed' then
  raise exception 'Este atendimento está encerrado; abra uma nova solicitação'
   using errcode='P0001';
 end if;
 if (select count(*) from public.customer_service_messages
   where author_id=v_user and created_at>clock_timestamp()-interval '1 hour')>=12 then
  raise exception 'Limite de mensagens por hora atingido' using errcode='P0001';
 end if;
 insert into public.customer_service_messages(request_id,author_id,author_role,body)
  values(p_request_id,v_user,case when v_staff then 'staff' else 'customer' end,v_text)
  returning * into v_message;

 if v_staff then
  -- A coluna antiga permanece compatível com a listagem e a restrição de resposta.
  update public.customer_service_requests
   set status='resolved',admin_note=v_text
   where id=p_request_id;
  v_status:='resolved';
 else
  -- O retorno do cliente reabre a solicitação respondida para análise.
  update public.customer_service_requests
   set status=case when status='resolved' then 'open' else status end
   where id=p_request_id;
  v_status:=case when v_request.status='resolved' then 'open' else v_request.status end;
 end if;
 return jsonb_build_object('id',v_message.id,'status',v_status);
end;
$$;
revoke all on function public.post_service_message(uuid,text) from public,anon,authenticated;
grant execute on function public.post_service_message(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
