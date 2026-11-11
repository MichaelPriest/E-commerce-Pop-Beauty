-- Popê Beauty | Estrutura independente de gateways em HOMOLOGAÇÃO.
-- Esta migração NUNCA envia cobranças, captura pagamentos ou credita pedidos.
-- Não existe endpoint público para receber confirmações financeiras.
create table if not exists public.sandbox_payment_attempts (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete cascade,
 provider text not null references public.payment_gateway_settings(provider),
 idempotency_key uuid not null,
 amount_cents integer not null check (amount_cents > 0 and amount_cents <= 5000000),
 currency char(3) not null default 'BRL' check (currency='BRL'),
 environment text not null default 'sandbox' check (environment='sandbox'),
 state text not null default 'draft' check (state in ('draft','expired','cancelled')),
 created_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint sandbox_attempt_idempotency unique(order_id,idempotency_key)
);
create unique index if not exists idx_one_draft_per_test_order
 on public.sandbox_payment_attempts(order_id) where state='draft';
create index if not exists idx_sandbox_attempts_created
 on public.sandbox_payment_attempts(created_at desc);
create index if not exists idx_sandbox_attempts_creator
 on public.sandbox_payment_attempts(created_by,created_at desc);

alter table public.sandbox_payment_attempts enable row level security;
drop policy if exists "sandbox_payment_attempts_admin_read" on public.sandbox_payment_attempts;
create policy "sandbox_payment_attempts_admin_read" on public.sandbox_payment_attempts
 for select to authenticated using ((select private.is_admin()));
revoke all on public.sandbox_payment_attempts from public,anon,authenticated;
grant select on public.sandbox_payment_attempts to authenticated;

-- Inbox pronta para integrações futuras. Não há rota de webhook ativa.
-- Sem payload, cartão ou token salvo no banco; cada evento exige autenticação externa.
create table if not exists public.payment_webhook_receipts (
 id uuid primary key default gen_random_uuid(),
 provider text not null references public.payment_gateway_settings(provider),
 external_event_id text not null check(length(external_event_id) between 1 and 180),
 payload_sha256 text not null check(payload_sha256 ~ '^[0-9a-f]{64}$'),
 signature_validated boolean not null default false,
 processed_at timestamptz,
 received_at timestamptz not null default now(),
 constraint payment_webhook_receipts_dedupe unique(provider,external_event_id)
);
create index if not exists idx_webhook_receipts_received_at
 on public.payment_webhook_receipts(received_at desc);
alter table public.payment_webhook_receipts enable row level security;
drop policy if exists "webhook_receipts_admin_read" on public.payment_webhook_receipts;
create policy "webhook_receipts_admin_read" on public.payment_webhook_receipts
 for select to authenticated using ((select private.is_admin()));
revoke all on public.payment_webhook_receipts from public,anon,authenticated;
grant select on public.payment_webhook_receipts to authenticated;

create or replace function private.plan_sandbox_payment_attempt(
 p_order_id uuid,p_provider text,p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_order record;v_attempt record;v_result uuid;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administradores podem preparar pagamentos de teste' using errcode='42501';
 end if;
 if p_order_id is null or p_idempotency_key is null then
  raise exception 'Pedido e chave de idempotência são obrigatórios';
 end if;
 if p_provider is null or p_provider not in
  ('mercado_pago','pagbank','pagarme','asaas','stripe','efi','paypal','cielo') then
  raise exception 'Provedor sem homologação de sandbox habilitada';
 end if;
 perform pg_advisory_xact_lock(hashtext('pope-checkout-serialization'));
 select id,origin,status,total_cents,reservation_expires_at into v_order
 from public.orders where id=p_order_id for update;
 if not found or v_order.origin<>'store_api' then
  raise exception 'Pedido de homologação não encontrado';
 end if;
 select id,provider into v_attempt from public.sandbox_payment_attempts
  where order_id=p_order_id and idempotency_key=p_idempotency_key;
 if found then
  if v_attempt.provider<>p_provider then
   raise exception 'Chave de idempotência já utilizada para outro provedor';
  end if;
  return v_attempt.id;
 end if;
 if v_order.status<>'pending' or v_order.reservation_expires_at<=now()
  or v_order.total_cents<=0 then
  raise exception 'Reserva expirada, cancelada ou sem subtotal válido';
 end if;
 if exists (select 1 from public.sandbox_payment_attempts
   where order_id=p_order_id and state='draft') then
  raise exception 'Este pedido já possui uma preparação de pagamento';
 end if;
 insert into public.sandbox_payment_attempts(
  order_id,provider,idempotency_key,amount_cents,currency,environment,state,created_by
 ) values (
  p_order_id,p_provider,p_idempotency_key,v_order.total_cents,'BRL','sandbox','draft',auth.uid()
 ) returning id into v_result;
 return v_result;
end;
$$;
revoke all on function private.plan_sandbox_payment_attempt(uuid,text,uuid) from public,anon;
grant execute on function private.plan_sandbox_payment_attempt(uuid,text,uuid) to authenticated;

create or replace function public.plan_sandbox_payment_attempt(
 p_order_id uuid,p_provider text,p_idempotency_key uuid
) returns uuid language sql security invoker set search_path=''
as $$
 select private.plan_sandbox_payment_attempt(p_order_id,p_provider,p_idempotency_key)
$$;
revoke all on function public.plan_sandbox_payment_attempt(uuid,text,uuid) from public,anon;
grant execute on function public.plan_sandbox_payment_attempt(uuid,text,uuid) to authenticated;

create or replace function private.close_sandbox_payment_attempts()
 returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if old.origin='store_api' and old.status='pending' and
   new.status='cancelled' and new.status is distinct from old.status then
   update public.sandbox_payment_attempts
    set state=case when old.reservation_expires_at<=now() then 'expired' else 'cancelled' end,
        updated_at=now()
    where order_id=new.id and state='draft';
 end if;
 return new;
end;
$$;
revoke all on function private.close_sandbox_payment_attempts() from public,anon,authenticated;
drop trigger if exists trg_close_sandbox_payment_attempts on public.orders;
create trigger trg_close_sandbox_payment_attempts
 after update of status on public.orders
 for each row execute function private.close_sandbox_payment_attempts();

comment on table public.sandbox_payment_attempts is
 'Preparação administrativa de sandbox sem transação financeira, cobrança, captura ou aprovação.';
comment on table public.payment_webhook_receipts is
 'Inbox para webhooks futuros; não há endpoint habilitado e nunca armazena payload ou dados de cartão.';
