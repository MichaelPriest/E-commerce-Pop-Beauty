-- Mercado Pago TEST: auditoria restrita de eventos assinados e consultados no provedor.
-- Nunca libera pedido, estorna, entrega, envia e-mail ou confirma recebimento.
alter table public.payment_webhook_receipts
 add column if not exists provider_resource_id text
  check(provider_resource_id is null or length(provider_resource_id) between 1 and 80),
 add column if not exists matched_attempt_id uuid
  references public.sandbox_payment_attempts(id) on delete set null,
 add column if not exists provider_payment_status text
  check(provider_payment_status is null or length(provider_payment_status)<=40),
 add column if not exists provider_currency char(3),
 add column if not exists provider_amount_cents bigint
  check(provider_amount_cents is null or provider_amount_cents>=0),
 add column if not exists relation_status text
  check(relation_status is null or relation_status in (
   'matched','unknown_reference','seller_mismatch','amount_mismatch',
   'inactive_reservation','payment_not_test','payment_unverified')),
 add column if not exists live_mode boolean,
 add column if not exists verified_seller_id text
  check(verified_seller_id is null or length(verified_seller_id)<=30);

create index if not exists idx_payment_webhook_receipts_attempt
 on public.payment_webhook_receipts(matched_attempt_id)
 where matched_attempt_id is not null;
create index if not exists idx_payment_webhook_receipts_resource
 on public.payment_webhook_receipts(provider,provider_resource_id)
 where provider_resource_id is not null;

comment on table public.payment_webhook_receipts is
 'Auditoria de notificação TEST: HMAC validado e pagamento consultado na API do provedor. Sem payload, dados de cartão ou baixa financeira.';
comment on column public.payment_webhook_receipts.relation_status is
 'Conciliação de auditoria apenas. matched não significa status financeiro pago nem entrega autorizada.';
