-- Restringir URL de preferência de teste a domínio exato (evitar domínio com sufixos).
create or replace function private.finish_mp_test_checkout(
 p_attempt_id uuid,p_preference_id text,p_checkout_url text
) returns boolean language plpgsql security definer set search_path=''
as $$
declare v_attempt record;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Acesso negado' using errcode='42501';end if;
 if length(btrim(coalesce(p_preference_id,''))) not between 10 and 180 or
    length(coalesce(p_checkout_url,'')) not between 30 and 2000 or
    p_checkout_url !~ '^https://(www[.])?mercadopago[.]com([/?]|$)' then
  raise exception 'Resposta do Mercado Pago inválida';end if;
 perform pg_advisory_xact_lock(hashtext('pope-checkout-serialization'));
 select a.id,a.provider,a.state,a.checkout_generation_state,o.status,o.origin,
    o.reservation_expires_at into v_attempt
 from public.sandbox_payment_attempts a
 join public.orders o on o.id=a.order_id where a.id=p_attempt_id for update of a;
 if not found or v_attempt.provider<>'mercado_pago' or
   v_attempt.state<>'draft' or v_attempt.checkout_generation_state<>'preparing'
   or v_attempt.status<>'pending' or v_attempt.origin<>'store_api'
   or v_attempt.reservation_expires_at<=now() then
  raise exception 'Reserva de teste não está válida para concluir a preparação';end if;
 update public.sandbox_payment_attempts
  set checkout_generation_state='ready',
      provider_checkout_id=btrim(p_preference_id),
      provider_checkout_url=p_checkout_url,
      checkout_generated_at=now(),updated_at=now()
  where id=p_attempt_id;
 return true;
end;
$$;

