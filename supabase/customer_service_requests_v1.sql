-- Popê Beauty: atendimento pós-venda. Solicitações não geram estornos ou operações financeiras.
begin;

create table if not exists public.customer_service_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 order_id uuid references public.orders(id) on delete set null,
 category text not null check (category in ('troca','devolucao','entrega','produto','outro')),
 subject text not null check (length(btrim(subject)) between 5 and 120),
 description text not null check (length(btrim(description)) between 20 and 2000),
 status text not null default 'open' check (status in ('open','in_review','resolved','closed')),
 admin_note text check (admin_note is null or length(admin_note)<=1200),
 constraint resolved_service_requires_reply check (
  status not in ('resolved','closed')
  or (admin_note is not null and length(btrim(admin_note)) between 10 and 1200)
 ),
 reviewed_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
create index if not exists customer_service_owner_recent_idx
 on public.customer_service_requests(user_id,created_at desc);
create index if not exists customer_service_admin_queue_idx
 on public.customer_service_requests(status,created_at desc);
create index if not exists customer_service_order_idx
 on public.customer_service_requests(order_id) where order_id is not null;

alter table public.customer_service_requests enable row level security;
revoke all on public.customer_service_requests from public,anon,authenticated;
grant select on public.customer_service_requests to authenticated;
grant insert(user_id,order_id,category,subject,description)
 on public.customer_service_requests to authenticated;
grant update(status,admin_note) on public.customer_service_requests to authenticated;

create policy service_request_owner_admin_read on public.customer_service_requests
 for select to authenticated
 using (user_id=(select auth.uid()) or (select private.is_admin()));
create policy service_request_owner_create on public.customer_service_requests
 for insert to authenticated
 with check (
  user_id=(select auth.uid())
  and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false
  and (order_id is null or exists (
   select 1 from public.orders o
   where o.id=order_id and o.customer_id=(select auth.uid())
  ))
 );
create policy service_request_admin_update on public.customer_service_requests
 for update to authenticated
 using ((select private.is_admin()))
 with check ((select private.is_admin()));

create or replace function private.guard_customer_service_request()
returns trigger language plpgsql set search_path=''
as $$
begin
 if TG_OP='INSERT' then
  if new.user_id is distinct from auth.uid() then
   raise exception 'Somente o titular pode solicitar atendimento'
    using errcode='42501';
  end if;
  -- Serializa abertura por cliente, evitando abuso em solicitações simultâneas.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
  if (select count(*) from public.customer_service_requests
   where user_id=new.user_id and created_at>clock_timestamp()-interval '1 hour')>=3 then
   raise exception 'Limite de três solicitações por hora atingido';
  end if;
  return new;
 end if;
 new.updated_at=clock_timestamp();
 new.reviewed_by=auth.uid();
 return new;
end;
$$;
revoke all on function private.guard_customer_service_request()
 from public,anon,authenticated;
drop trigger if exists guard_customer_service_request on public.customer_service_requests;
create trigger guard_customer_service_request
 before insert or update on public.customer_service_requests
 for each row execute function private.guard_customer_service_request();

-- Nenhuma atualização de pedidos, pagamentos, inventário, logística ou NF-e.
notify pgrst,'reload schema';
commit;
