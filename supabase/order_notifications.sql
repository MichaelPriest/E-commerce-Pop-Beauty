-- Popê Beauty: outbox transacional para e-mails de pedidos.
-- A fila é privada via RLS, e nenhum SMTP pode disparar sem confirmação da ação.
create table if not exists public.order_notifications (
 id uuid primary key default gen_random_uuid(),
 order_event_id uuid not null unique references public.order_events(id) on delete cascade,
 order_id uuid not null references public.orders(id) on delete cascade,
 customer_id uuid not null references auth.users(id) on delete cascade,
 event_type text not null check(event_type in ('created','payment_confirmed','shipped','delivered','cancelled')),
 recipient_email text not null check(length(recipient_email) between 3 and 254),
 recipient_name text not null default '',
 status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
 attempts integer not null default 0 check(attempts between 0 and 10),
 next_attempt_at timestamptz not null default now(),
 claimed_at timestamptz,
 claim_token uuid,
 last_attempt_at timestamptz,
 sent_at timestamptz,
 provider_message_id text,
 error_message text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists idx_order_notifications_queue
 on public.order_notifications(status,next_attempt_at,created_at);
create index if not exists idx_order_notifications_order
 on public.order_notifications(order_id,created_at desc);
create index if not exists idx_order_notifications_customer on public.order_notifications(customer_id);
alter table public.order_notifications enable row level security;
drop policy if exists "order_notifications_admin_select" on public.order_notifications;
create policy "order_notifications_admin_select" on public.order_notifications
 for select to authenticated using ((select private.is_admin()));
revoke all on public.order_notifications from public,anon,authenticated;
grant select on public.order_notifications to authenticated;

-- Garante uma mensagem por evento, dentro da mesma transação da alteração.
-- Cópia do endereço fica protegida; nunca há e-mail para pedidos sem cliente.
create or replace function private.enqueue_order_notification() returns trigger
 language plpgsql security definer set search_path=''
as $$
declare v_email text; v_name text; v_adult boolean;
begin
 if new.event_type not in ('created','payment_confirmed','shipped','delivered','cancelled') then
  return new;
 end if;
 if not exists(select 1 from public.orders o where o.id=new.order_id and o.customer_id is not null)
 then return new; end if;
 select u.email,p.display_name into v_email,v_name from public.orders o
 join auth.users u on u.id=o.customer_id
 left join public.profiles p on p.id=u.id
 where o.id=new.order_id;
 if v_email is null or length(v_email) not between 3 and 254 then return new; end if;
 -- Defense in depth: não divulgar produtos adultos em e-mails transacionais.
 select exists (
  select 1 from public.order_items oi
   join public.variants v on oi.variant_id=v.id
   join public.products p on v.product_id=p.id
   where oi.order_id=new.order_id and p.is_adult
 ) into v_adult;
 if v_adult then return new;end if;
 insert into public.order_notifications(
  order_event_id,order_id,customer_id,event_type,recipient_email,recipient_name
 ) values (new.id,new.order_id,
  (select customer_id from public.orders where id=new.order_id),
  new.event_type,v_email,coalesce(v_name,''))
 on conflict(order_event_id) do nothing;
 return new;
end;
$$;
revoke all on function private.enqueue_order_notification() from public,anon,authenticated;
drop trigger if exists pope_enqueue_order_notification on public.order_events;
create trigger pope_enqueue_order_notification after insert on public.order_events
 for each row execute function private.enqueue_order_notification();

-- Administração reclama uma mensagem com lock e token de entrega.
-- O retorno contém o mínimo necessário para preencher o template.
create or replace function public.claim_order_notification(
 p_notification_id uuid default null, p_order_id uuid default null
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_row record;v_token uuid;
begin
 if not private.is_admin() or auth.uid() is null then
  raise exception 'Somente administradores podem processar notificações' using errcode='42501';end if;
 select n.id,n.order_id,n.event_type,n.recipient_email,n.recipient_name,
        o.total_cents,o.carrier,o.tracking_code
 into v_row from public.order_notifications n
 join public.orders o on o.id=n.order_id
 where (p_notification_id is null or n.id=p_notification_id)
   and (p_order_id is null or n.order_id=p_order_id)
   and (
       (n.status in ('pending','failed') and n.next_attempt_at<=now())
       or (n.status='sending' and n.claimed_at<now()-interval '10 minutes')
   )
   and n.attempts<5
 order by n.created_at,n.id
 for update of n skip locked limit 1;
 if not found then return null;end if;
 v_token:=gen_random_uuid();
 update public.order_notifications set status='sending',attempts=attempts+1,
  claim_token=v_token,claimed_at=now(),last_attempt_at=now(),updated_at=now(),error_message=null
 where id=v_row.id;
 return jsonb_build_object('id',v_row.id,'claim_token',v_token,'order_id',v_row.order_id,
  'event_type',v_row.event_type,'recipient_email',v_row.recipient_email,
  'recipient_name',v_row.recipient_name,'total_cents',v_row.total_cents,
  'carrier',v_row.carrier,'tracking_code',v_row.tracking_code);
end;
$$;
revoke all on function public.claim_order_notification(uuid,uuid) from public,anon;
grant execute on function public.claim_order_notification(uuid,uuid) to authenticated;

create or replace function public.finish_order_notification(
 p_notification_id uuid,p_claim_token uuid,p_success boolean,
 p_message_id text default null,p_error text default null
) returns boolean language plpgsql security definer set search_path=''
as $$
declare v_attempts integer;
begin
 if not private.is_admin() or auth.uid() is null then raise exception 'Acesso negado' using errcode='42501';end if;
 if p_success is null then raise exception 'Resultado inválido';end if;
 update public.order_notifications set
  status=case when p_success then 'sent' else 'failed' end,
  sent_at=case when p_success then now() else null end,
  error_message=case when p_success then null else left(coalesce(p_error,'Falha no SMTP'),400) end,
  provider_message_id=case when p_success then left(coalesce(p_message_id,''),250) else null end,
  next_attempt_at=case when p_success then now() else now()+interval '5 minutes' * (2 ^ least(attempts-1,4)) end,
  claim_token=null,claimed_at=null,updated_at=now()
  where id=p_notification_id and claim_token=p_claim_token and status='sending'
  returning attempts into v_attempts;
 if not found then raise exception 'Notificação não reclamada ou token de envio inválido';end if;
 return true;
end;
$$;
revoke all on function public.finish_order_notification(uuid,uuid,boolean,text,text) from public,anon;
grant execute on function public.finish_order_notification(uuid,uuid,boolean,text,text) to authenticated;

create or replace function public.retry_order_notification(p_id uuid)
 returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if not private.is_admin() or auth.uid() is null then raise exception 'Acesso negado' using errcode='42501';end if;
 update public.order_notifications set status='pending',attempts=0,
  next_attempt_at=now(),error_message=null,claimed_at=null,claim_token=null,updated_at=now()
 where id=p_id and status='failed';
 if not found then raise exception 'Somente notificações com falha podem ser reenviadas';end if;
 return true;
end;
$$;
revoke all on function public.retry_order_notification(uuid) from public,anon;
grant execute on function public.retry_order_notification(uuid) to authenticated;

comment on table public.order_notifications is
 'Fila de e-mails de pedidos; somente admin consulta. Entrega SMTP ocorre fora da transação e pode exigir reenvio controlado.';
