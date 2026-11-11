-- Popê Beauty: diretório seguro de usuários, permissões e trilha de auditoria.
-- Revogar gravações públicas: alterações de papel ocorrem exclusivamente por RPC privada.
create table if not exists public.admin_audit_events (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid references auth.users(id) on delete set null,
 target_user_id uuid references auth.users(id) on delete set null,
 action text not null check(action in ('user_role_changed','adult_section_toggled')),
 before_value text,
 after_value text,
 created_at timestamptz not null default now()
);
create index if not exists idx_admin_audit_events_created on public.admin_audit_events(created_at desc);
create index if not exists idx_admin_audit_events_actor on public.admin_audit_events(actor_id,created_at desc);
create index if not exists idx_admin_audit_events_target on public.admin_audit_events(target_user_id,created_at desc);
alter table public.admin_audit_events enable row level security;
drop policy if exists "admin_audit_events_read_admin" on public.admin_audit_events;
create policy "admin_audit_events_read_admin" on public.admin_audit_events
 for select to authenticated using ((select private.is_admin()));
revoke all on public.admin_audit_events from public,anon,authenticated;
grant select on public.admin_audit_events to authenticated;

create or replace function private.audit_profile_role_change() returns trigger
 language plpgsql security definer set search_path=''
as $$
begin
 insert into public.admin_audit_events(actor_id,target_user_id,action,before_value,after_value)
 values(auth.uid(),new.id,'user_role_changed',old.role,new.role);
 return new;
end;
$$;
revoke all on function private.audit_profile_role_change() from public,anon,authenticated;
drop trigger if exists pope_audit_profile_roles on public.profiles;
create trigger pope_audit_profile_roles
 after update of role on public.profiles for each row
 when (old.role is distinct from new.role)
 execute function private.audit_profile_role_change();

create or replace function private.audit_adult_settings() returns trigger
 language plpgsql security definer set search_path=''
as $$
begin
 insert into public.admin_audit_events(actor_id,action,before_value,after_value)
 values(auth.uid(),'adult_section_toggled',old.adult_enabled::text,new.adult_enabled::text);
 return new;
end;
$$;
revoke all on function private.audit_adult_settings() from public,anon,authenticated;
drop trigger if exists pope_audit_adult_settings on public.store_settings;
create trigger pope_audit_adult_settings
 after update of adult_enabled on public.store_settings for each row
 when (old.adult_enabled is distinct from new.adult_enabled)
 execute function private.audit_adult_settings();

-- Uma função privada, protegida por checagem de role, lê dados que não são expostos pela API
-- pública (auth.users). Não altera dados de login, e-mail, senhas nem MFA.
create or replace function private.admin_users_directory()
 returns table (
  user_id uuid,display_name text,app_role text,registered_at timestamptz,
  email text,email_confirmed boolean,last_signed_in_at timestamptz
 ) language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administradores podem consultar o diretório de usuários'
   using errcode='42501';
 end if;
 return query
 select p.id,p.display_name,p.role,p.created_at,
        coalesce(u.email,''),u.email_confirmed_at is not null,u.last_sign_in_at
 from public.profiles p join auth.users u on u.id=p.id
 order by p.created_at desc limit 1000;
end;
$$;
revoke all on function private.admin_users_directory() from public,anon,authenticated;
grant execute on function private.admin_users_directory() to authenticated;

create or replace function public.admin_users_directory()
 returns table (
  user_id uuid,display_name text,app_role text,registered_at timestamptz,
  email text,email_confirmed boolean,last_signed_in_at timestamptz
 ) language sql security invoker set search_path=''
as $$
 select * from private.admin_users_directory()
$$;
revoke all on function public.admin_users_directory() from public,anon;
grant execute on function public.admin_users_directory() to authenticated;

-- Não permitir autoelevação/rebaixamento. Apenas admins mudam o perfil de OUTRA conta.
-- Permissões são lidas no banco a cada acesso; mudar para staff não libera
-- módulos reservados exclusivamente a administradores.
create or replace function private.change_user_role(p_user_id uuid,p_role text)
 returns boolean language plpgsql security definer set search_path=''
as $$
declare current_role text;target_confirmed boolean;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administradores podem gerenciar permissões' using errcode='42501';
 end if;
 if p_user_id is null then raise exception 'Selecione um usuário válido';end if;
 if p_user_id=auth.uid() then
  raise exception 'Você não pode alterar seu próprio nível de acesso';
 end if;
 if p_role is null or p_role not in ('customer','staff','admin') then
  raise exception 'Perfil de acesso inválido';
 end if;
 select p.role,u.email_confirmed_at is not null into current_role,target_confirmed
 from public.profiles p join auth.users u on u.id=p.id
 where p.id=p_user_id for update of p;
 if not found then raise exception 'Usuário não encontrado';end if;
 if p_role in ('staff','admin') and not target_confirmed then
  raise exception 'O e-mail do usuário precisa estar confirmado antes de conceder acesso à equipe';
 end if;
 if current_role=p_role then return false;end if;
 update public.profiles set role=p_role where id=p_user_id;
 return true;
end;
$$;
revoke all on function private.change_user_role(uuid,text) from public,anon,authenticated;
grant execute on function private.change_user_role(uuid,text) to authenticated;

create or replace function public.change_user_role(p_user_id uuid,p_role text)
 returns boolean language sql security invoker set search_path=''
as $$
 select private.change_user_role(p_user_id,p_role)
$$;
revoke all on function public.change_user_role(uuid,text) from public,anon;
grant execute on function public.change_user_role(uuid,text) to authenticated;

comment on table public.admin_audit_events is
 'Registro administrativo de mudanças de papéis e ativação do módulo adulto; leitura somente para admin.';
