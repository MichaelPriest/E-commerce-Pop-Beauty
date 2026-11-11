-- Snapshot do endereço verificado do Auth para identificação administrativa.
-- Não permite escrita direta de e-mails: somente a função privada os atualiza a partir de auth.users.
alter table public.user_session_presence
 add column if not exists user_email text not null default '' check(length(user_email)<=254);

create or replace function private.touch_user_session_presence() returns boolean
 language plpgsql security definer set search_path=''
as $$
declare v_user uuid;v_session uuid;v_email text;
begin
 v_user:=auth.uid();
 if v_user is null then return false;end if;
 if nullif(auth.jwt()->>'session_id','') is null then return false;end if;
 v_session:=(auth.jwt()->>'session_id')::uuid;
 select coalesce(u.email,'') into v_email from auth.users u where u.id=v_user;
 if not found then return false;end if;
 insert into public.user_session_presence(session_id,user_id,user_email,started_at,last_seen_at,signed_out_at)
 values(v_session,v_user,left(v_email,254),now(),now(),null)
 on conflict (session_id) do update
  set last_seen_at=greatest(public.user_session_presence.last_seen_at,now()),
      user_email=excluded.user_email,
      signed_out_at=null
  where public.user_session_presence.user_id=v_user;
 return true;
end;
$$;
revoke all on function private.touch_user_session_presence() from public,anon;
grant execute on function private.touch_user_session_presence() to authenticated;
