-- Corrige a auditoria da revisão +18 sem permitir autoaprovação.
-- Um revisor humano é sempre outra conta autenticada com função de administrador.
alter table public.age_verifications
  add constraint age_verifications_no_self_review
  check (verified_by is null or verified_by <> user_id);

drop policy if exists "age_verification_admin_insert" on public.age_verifications;
create policy "age_verification_admin_insert"
  on public.age_verifications for insert to authenticated
  with check (
    (select private.is_admin())
    and user_id <> (select auth.uid())
    and verified_by = (select auth.uid())
    and method = 'manual_document'
    and verified_at <= now()
    and expires_at > now()
    and expires_at <= now() + interval '366 days'
  );

drop policy if exists "age_verification_admin_update" on public.age_verifications;
create policy "age_verification_admin_update"
  on public.age_verifications for update to authenticated
  using (
    (select private.is_admin())
    and user_id <> (select auth.uid())
  )
  with check (
    (select private.is_admin())
    and user_id <> (select auth.uid())
    and verified_by = (select auth.uid())
    and method = 'manual_document'
    and verified_at <= now()
    and expires_at > now()
    and expires_at <= now() + interval '366 days'
  );

drop policy if exists "age_requests_admin_update" on public.age_verification_requests;
create policy "age_requests_admin_update"
  on public.age_verification_requests for update to authenticated
  using (
    (select private.is_admin())
    and user_id <> (select auth.uid())
  )
  with check (
    (select private.is_admin())
    and user_id <> (select auth.uid())
    and (
      reviewed_by = (select auth.uid())
      or (status = 'pending' and reviewed_at is null and reviewed_by is null)
    )
  );

create or replace function public.review_age_verification(
  p_user_id uuid,
  p_approved boolean,
  p_method text default 'manual_document'
) returns boolean language plpgsql security invoker set search_path = ''
as $$
declare v_status text;
begin
  if not private.is_admin() then
    raise exception 'Somente administradores podem revisar solicitações' using errcode='42501';
  end if;
  if p_user_id is null then
    raise exception 'Conta não encontrada para revisão';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'Não é permitido revisar sua própria maioridade. Solicite a conferência a outro administrador habilitado.';
  end if;
  if p_approved is null then
    raise exception 'Decisão inválida';
  end if;
  if p_approved and p_method <> 'manual_document' then
    raise exception 'Somente conferência documental independente está habilitada';
  end if;
  select status into v_status from public.age_verification_requests
    where user_id=p_user_id for update;
  if not found then raise exception 'Solicitação de maioridade não encontrada'; end if;
  if v_status <> 'pending' then raise exception 'Essa solicitação já foi revisada'; end if;
  if p_approved then
    insert into public.age_verifications(user_id,method,verified_at,expires_at,verified_by)
    values(p_user_id,'manual_document',now(),now()+interval '365 days',(select auth.uid()))
    on conflict(user_id) do update
      set method=excluded.method,verified_at=excluded.verified_at,
      expires_at=excluded.expires_at,verified_by=excluded.verified_by;
  else
    delete from public.age_verifications where user_id=p_user_id;
  end if;
  update public.age_verification_requests
  set status=case when p_approved then 'approved' else 'rejected' end,
      reviewed_at=now(),reviewed_by=(select auth.uid())
  where user_id=p_user_id;
  return true;
end;
$$;
revoke all on function public.review_age_verification(uuid,boolean,text) from public,anon;
grant execute on function public.review_age_verification(uuid,boolean,text) to authenticated;