-- Popê Beauty — presença de sessão observada via heartbeat.
-- "Online" significa atividade recente no navegador, NÃO certificação de que a sessão Auth ainda é válida.
create table if not exists public.user_session_presence (
 session_id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 started_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 signed_out_at timestamptz,
 constraint pope_presence_order check (last_seen_at>=started_at)
);
create index if not exists idx_presence_active on public.user_session_presence(last_seen_at desc)
 where signed_out_at is null;
create index if not exists idx_presence_user_last_seen on public.user_session_presence(user_id,last_seen_at desc);
alter table public.user_session_presence enable row level security;
drop policy if exists "presence_read_own_or_admin" on public.user_session_presence;
create policy "presence_read_own_or_admin" on public.user_session_presence for select to authenticated
 using (user_id=(select auth.uid()) or (select private.is_admin()));
revoke all on public.user_session_presence from public,anon,authenticated;
grant select on public.user_session_presence to authenticated;

-- Sem privilégios de INSERT/UPDATE ao navegador: timestamps são sempre definidos no servidor.
create or replace function private.touch_user_session_presence() returns boolean
 language plpgsql security definer set search_path=''
as $$
declare v_user uuid;v_session uuid;
begin
 v_user:=auth.uid();
 if v_user is null then return false;end if;
 if nullif(auth.jwt()->>'session_id','') is null then return false;end if;
 v_session:=(auth.jwt()->>'session_id')::uuid;
 insert into public.user_session_presence(session_id,user_id,started_at,last_seen_at,signed_out_at)
 values(v_session,v_user,now(),now(),null)
 on conflict (session_id) do update
  set last_seen_at=greatest(public.user_session_presence.last_seen_at,now()),
      signed_out_at=null
  where public.user_session_presence.user_id=v_user;
 return true;
end;
$$;
revoke all on function private.touch_user_session_presence() from public,anon;
grant execute on function private.touch_user_session_presence() to authenticated;

create or replace function public.touch_user_session_presence() returns boolean
 language sql security invoker set search_path=''
as $$select private.touch_user_session_presence()$$;
revoke all on function public.touch_user_session_presence() from public,anon;
grant execute on function public.touch_user_session_presence() to authenticated;

create or replace function private.end_user_session_presence() returns boolean
 language plpgsql security definer set search_path=''
as $$
declare v_user uuid;v_session uuid;
begin
 v_user:=auth.uid();
 if v_user is null or nullif(auth.jwt()->>'session_id','') is null then return false;end if;
 v_session:=(auth.jwt()->>'session_id')::uuid;
 update public.user_session_presence set signed_out_at=now(),last_seen_at=now()
 where user_id=v_user and session_id=v_session and signed_out_at is null;
 return found;
end;
$$;
revoke all on function private.end_user_session_presence() from public,anon;
grant execute on function private.end_user_session_presence() to authenticated;

create or replace function public.end_user_session_presence() returns boolean
 language sql security invoker set search_path=''
as $$select private.end_user_session_presence()$$;
revoke all on function public.end_user_session_presence() from public,anon;
grant execute on function public.end_user_session_presence() to authenticated;

comment on table public.user_session_presence is
 'Sinais recentes de atividade por sessão Auth. Online = sinal há menos de 3 minutos. Não é listagem autoritativa das sessões Auth.';
