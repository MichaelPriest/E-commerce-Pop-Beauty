-- Catálogo administrativo de opções de pagamento. Esta migração NÃO habilita checkout
-- nem guarda chaves, tokens, números de cartão ou credenciais dos provedores.
create table if not exists public.payment_gateway_settings (
 provider text primary key check (provider in (
  'mercado_pago','pagbank','pagarme','asaas','stripe','efi','paypal',
  'cielo','iugu','infinitepay'
 )),
 included_in_evaluation boolean not null default true,
 preferred_for_sandbox boolean not null default false,
 notes text not null default '' check (length(notes)<=500),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null
);
create unique index if not exists idx_pope_gateway_one_sandbox_choice
 on public.payment_gateway_settings(preferred_for_sandbox)
 where preferred_for_sandbox;
insert into public.payment_gateway_settings(provider) values
 ('mercado_pago'),('pagbank'),('pagarme'),('asaas'),('stripe'),
 ('efi'),('paypal'),('cielo'),('iugu'),('infinitepay')
on conflict(provider) do nothing;

alter table public.payment_gateway_settings enable row level security;
drop policy if exists "gateway_settings_admin_read" on public.payment_gateway_settings;
create policy "gateway_settings_admin_read" on public.payment_gateway_settings
 for select to authenticated using ((select private.is_admin()));
revoke all on public.payment_gateway_settings from public,anon,authenticated;
grant select on public.payment_gateway_settings to authenticated;

create table if not exists public.payment_gateway_audit (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid references auth.users(id) on delete set null,
 provider text not null,
 event text not null check(event in ('evaluation_changed','sandbox_candidate_changed')),
 old_included boolean,new_included boolean,
 old_candidate boolean,new_candidate boolean,
 created_at timestamptz not null default now()
);
create index if not exists idx_gateway_audit_created on public.payment_gateway_audit(created_at desc);
create index if not exists idx_gateway_audit_actor on public.payment_gateway_audit(actor_id,created_at desc);
alter table public.payment_gateway_audit enable row level security;
drop policy if exists "gateway_audit_admin_read" on public.payment_gateway_audit;
create policy "gateway_audit_admin_read" on public.payment_gateway_audit
 for select to authenticated using ((select private.is_admin()));
revoke all on public.payment_gateway_audit from public,anon,authenticated;
grant select on public.payment_gateway_audit to authenticated;

create or replace function private.audit_gateway_change()
 returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.included_in_evaluation is distinct from old.included_in_evaluation
  or new.preferred_for_sandbox is distinct from old.preferred_for_sandbox then
  insert into public.payment_gateway_audit(
   actor_id,provider,event,old_included,new_included,old_candidate,new_candidate)
  values(auth.uid(),new.provider,
   case when new.preferred_for_sandbox is distinct from old.preferred_for_sandbox
   then 'sandbox_candidate_changed' else 'evaluation_changed' end,
   old.included_in_evaluation,new.included_in_evaluation,
   old.preferred_for_sandbox,new.preferred_for_sandbox);
 end if;
 return new;
end;
$$;
revoke all on function private.audit_gateway_change() from public,anon,authenticated;
drop trigger if exists pope_gateway_audit_trigger on public.payment_gateway_settings;
create trigger pope_gateway_audit_trigger
 after update on public.payment_gateway_settings for each row
 execute function private.audit_gateway_change();

-- Um único candidato de homologação, mas N integrações poderão ser comparadas.
-- Marcar candidato NÃO ativa venda nem altera qualquer pedido.
create or replace function private.save_gateway_evaluation(
 p_provider text,p_included boolean,p_preferred boolean,p_notes text
) returns boolean language plpgsql security definer set search_path=''
as $$
declare v_old record;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Apenas administradores podem configurar gateways' using errcode='42501';
 end if;
 if p_provider is null or not exists(
  select 1 from public.payment_gateway_settings where provider=p_provider)
 then raise exception 'Gateway não reconhecido';end if;
 if p_included is null or p_preferred is null then raise exception 'Opção inválida';end if;
 if p_preferred and not p_included then
  raise exception 'Um candidato precisa continuar incluído na avaliação';end if;
 if length(coalesce(p_notes,''))>500 then raise exception 'Observação acima de 500 caracteres';end if;
 if coalesce(p_notes,'') ~* '(sk_(test|live)_[[:alnum:]]+|APP_USR-[[:alnum:]-]+|-----BEGIN [A-Z ]+PRIVATE KEY|Bearer[[:space:]]+[[:alnum:]])'
 then raise exception 'Não cole senhas, tokens ou chaves de API neste campo';end if;
 perform pg_advisory_xact_lock(hashtext('pope_payment_gateway_preference'));
 if p_preferred then
  update public.payment_gateway_settings set preferred_for_sandbox=false,
    updated_at=now(),updated_by=auth.uid()
  where preferred_for_sandbox=true and provider<>p_provider;
 end if;
 update public.payment_gateway_settings
 set included_in_evaluation=p_included,preferred_for_sandbox=p_preferred,
  notes=coalesce(p_notes,''),updated_at=now(),updated_by=auth.uid()
 where provider=p_provider;
 return true;
end;
$$;
revoke all on function private.save_gateway_evaluation(text,boolean,boolean,text) from public,anon;
grant execute on function private.save_gateway_evaluation(text,boolean,boolean,text) to authenticated;

create or replace function public.save_gateway_evaluation(
 p_provider text,p_included boolean,p_preferred boolean,p_notes text default ''
) returns boolean language sql security invoker set search_path=''
as $$
 select private.save_gateway_evaluation(p_provider,p_included,p_preferred,p_notes)
$$;
revoke all on function public.save_gateway_evaluation(text,boolean,boolean,text) from public,anon;
grant execute on function public.save_gateway_evaluation(text,boolean,boolean,text) to authenticated;

comment on table public.payment_gateway_settings is
 'Preferências internas para comparar provedores; NÃO controla cobranças nem checkout.';
comment on table public.payment_gateway_audit is
 'Histórico de alterações na seleção de gateways; não armazena credenciais.';
