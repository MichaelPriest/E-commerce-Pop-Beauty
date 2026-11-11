-- Popê Beauty | Shopee / Mercado Livre: OAuth, vault cifrado e leitura isolada.
-- NUNCA confirma pagamentos, baixa estoque ou grava pedidos comerciais.
create table if not exists public.marketplace_connections(
 id uuid primary key default gen_random_uuid(),
 channel text not null check(channel in ('shopee','mercadolivre')),
 external_account_id text not null check(length(external_account_id) between 1 and 80),
 display_name text not null check(length(display_name) between 1 and 160),
 status text not null default 'connected' check(status in ('connected','disconnected','needs_reauth')),
 token_expires_at timestamptz,
 last_synced_at timestamptz,
 last_error text check(last_error is null or length(last_error)<=180),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(channel,external_account_id)
);
create index if not exists idx_marketplace_connections_status on public.marketplace_connections(channel,status);
alter table public.marketplace_connections enable row level security;
drop policy if exists "marketplace_connections_admin_read" on public.marketplace_connections;
create policy "marketplace_connections_admin_read" on public.marketplace_connections
 for select to authenticated using((select private.is_admin()));
revoke all on public.marketplace_connections from public,anon,authenticated;
grant select on public.marketplace_connections to authenticated;

create table if not exists private.marketplace_token_vault(
 connection_id uuid primary key references public.marketplace_connections(id) on delete cascade,
 cipher_access text not null check(length(cipher_access) between 60 and 12000),
 cipher_refresh text not null check(length(cipher_refresh) between 60 and 12000),
 revision bigint not null default 1 check(revision>0),
 updated_at timestamptz not null default now()
);
revoke all on private.marketplace_token_vault from public,anon,authenticated;
alter table private.marketplace_token_vault enable row level security;

create table if not exists public.marketplace_readonly_imports(
 id uuid primary key default gen_random_uuid(),
 connection_id uuid not null references public.marketplace_connections(id) on delete cascade,
 kind text not null check(kind in ('listing','order')),
 external_id text not null check(length(external_id) between 1 and 100),
 title text not null default '' check(length(title)<=200),
 sku text not null default '' check(length(sku)<=100),
 external_status text not null default '' check(length(external_status)<=80),
 amount_cents bigint check(amount_cents is null or amount_cents>=0),
 quantity integer check(quantity is null or quantity between 0 and 1000000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(connection_id,kind,external_id)
);
create index if not exists idx_marketplace_imports_recent on public.marketplace_readonly_imports(connection_id,kind,updated_at desc);
alter table public.marketplace_readonly_imports enable row level security;
drop policy if exists "marketplace_imports_admin_select" on public.marketplace_readonly_imports;
create policy "marketplace_imports_admin_select" on public.marketplace_readonly_imports
 for select to authenticated using((select private.is_admin()));
drop policy if exists "marketplace_imports_admin_insert" on public.marketplace_readonly_imports;
create policy "marketplace_imports_admin_insert" on public.marketplace_readonly_imports
 for insert to authenticated with check(
  (select private.is_admin()) and exists(
   select 1 from public.marketplace_connections a
   where a.id=connection_id and a.status='connected'));
drop policy if exists "marketplace_imports_admin_update" on public.marketplace_readonly_imports;
create policy "marketplace_imports_admin_update" on public.marketplace_readonly_imports
 for update to authenticated using((select private.is_admin()))
 with check((select private.is_admin()));
revoke all on public.marketplace_readonly_imports from public,anon,authenticated;
grant select,insert,update on public.marketplace_readonly_imports to authenticated;

create or replace function private.store_marketplace_authorization(
 p_channel text,p_account text,p_name text,p_access_cipher text,p_refresh_cipher text,p_expires timestamptz
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Acesso administrativo obrigatório' using errcode='42501';end if;
 if p_channel not in ('shopee','mercadolivre') or
  length(coalesce(p_account,'')) not between 1 and 80 or
  length(coalesce(p_name,'')) not between 1 and 160 or
  p_access_cipher not like 'v1.%' or p_refresh_cipher not like 'v1.%' or
  length(p_access_cipher) not between 60 and 12000 or
  length(p_refresh_cipher) not between 60 and 12000 or
  p_expires is null or p_expires<=now() then
   raise exception 'Dados da autorização inválidos';end if;
 insert into public.marketplace_connections(channel,external_account_id,display_name,status,token_expires_at,last_error,updated_at)
 values(p_channel,p_account,p_name,'connected',p_expires,null,now())
 on conflict(channel,external_account_id) do update
  set display_name=excluded.display_name,status='connected',
      token_expires_at=excluded.token_expires_at,last_error=null,updated_at=now()
 returning id into v_id;
 insert into private.marketplace_token_vault(connection_id,cipher_access,cipher_refresh,revision,updated_at)
 values(v_id,p_access_cipher,p_refresh_cipher,1,now())
 on conflict(connection_id) do update set
  cipher_access=excluded.cipher_access,cipher_refresh=excluded.cipher_refresh,
  revision=private.marketplace_token_vault.revision+1,updated_at=now();
 return v_id;
end;
$$;
revoke all on function private.store_marketplace_authorization(text,text,text,text,text,timestamptz) from public,anon;
grant execute on function private.store_marketplace_authorization(text,text,text,text,text,timestamptz) to authenticated;
create or replace function public.store_marketplace_authorization(
 p_channel text,p_account text,p_name text,p_access_cipher text,p_refresh_cipher text,p_expires timestamptz
) returns uuid language sql security invoker set search_path=''
as $$select private.store_marketplace_authorization(p_channel,p_account,p_name,p_access_cipher,p_refresh_cipher,p_expires)$$;
revoke all on function public.store_marketplace_authorization(text,text,text,text,text,timestamptz) from public,anon;
grant execute on function public.store_marketplace_authorization(text,text,text,text,text,timestamptz) to authenticated;

create or replace function private.read_marketplace_encrypted_tokens(p_connection_id uuid)
 returns jsonb language plpgsql security definer set search_path=''
as $$
declare v record;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Acesso administrativo obrigatório' using errcode='42501';end if;
 select t.cipher_access,t.cipher_refresh,t.revision
 into v from private.marketplace_token_vault t
 join public.marketplace_connections c on c.id=t.connection_id
 where c.id=p_connection_id and c.status='connected';
 if not found then raise exception 'Conta não conectada';end if;
 return jsonb_build_object('access',v.cipher_access,'refresh',v.cipher_refresh,'revision',v.revision);
end;
$$;
revoke all on function private.read_marketplace_encrypted_tokens(uuid) from public,anon;
grant execute on function private.read_marketplace_encrypted_tokens(uuid) to authenticated;
create or replace function public.read_marketplace_encrypted_tokens(p_connection_id uuid)
 returns jsonb language sql security invoker set search_path=''
as $$select private.read_marketplace_encrypted_tokens(p_connection_id)$$;
revoke all on function public.read_marketplace_encrypted_tokens(uuid) from public,anon;
grant execute on function public.read_marketplace_encrypted_tokens(uuid) to authenticated;

create or replace function private.rotate_marketplace_encrypted_tokens(
 p_id uuid,p_revision bigint,p_access_cipher text,p_refresh_cipher text,p_expires timestamptz
) returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Acesso administrativo obrigatório' using errcode='42501';end if;
 if p_access_cipher not like 'v1.%' or p_refresh_cipher not like 'v1.%'
  or p_expires is null or p_expires<=now() then
  raise exception 'Credenciais inválidas';end if;
 update private.marketplace_token_vault t
 set cipher_access=p_access_cipher,cipher_refresh=p_refresh_cipher,
     revision=t.revision+1,updated_at=now()
 where t.connection_id=p_id and t.revision=p_revision
  and exists(select 1 from public.marketplace_connections c
    where c.id=p_id and c.status='connected');
 if not found then raise exception 'Token já foi renovado por outro processo';end if;
 update public.marketplace_connections set token_expires_at=p_expires,
  updated_at=now(),last_error=null where id=p_id;
 return true;
end;
$$;
revoke all on function private.rotate_marketplace_encrypted_tokens(uuid,bigint,text,text,timestamptz) from public,anon;
grant execute on function private.rotate_marketplace_encrypted_tokens(uuid,bigint,text,text,timestamptz) to authenticated;
create or replace function public.rotate_marketplace_encrypted_tokens(
 p_id uuid,p_revision bigint,p_access_cipher text,p_refresh_cipher text,p_expires timestamptz
) returns boolean language sql security invoker set search_path=''
as $$select private.rotate_marketplace_encrypted_tokens(p_id,p_revision,p_access_cipher,p_refresh_cipher,p_expires)$$;
revoke all on function public.rotate_marketplace_encrypted_tokens(uuid,bigint,text,text,timestamptz) from public,anon;
grant execute on function public.rotate_marketplace_encrypted_tokens(uuid,bigint,text,text,timestamptz) to authenticated;

create or replace function private.disconnect_marketplace(p_id uuid)
 returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Acesso administrativo obrigatório' using errcode='42501';end if;
 delete from private.marketplace_token_vault where connection_id=p_id;
 update public.marketplace_connections set status='disconnected',token_expires_at=null,
  last_error=null,updated_at=now() where id=p_id;
 if not found then raise exception 'Conta não encontrada';end if;
 return true;
end;
$$;
revoke all on function private.disconnect_marketplace(uuid) from public,anon;
grant execute on function private.disconnect_marketplace(uuid) to authenticated;
create or replace function public.disconnect_marketplace(p_id uuid)
 returns boolean language sql security invoker set search_path=''
as $$select private.disconnect_marketplace(p_id)$$;
revoke all on function public.disconnect_marketplace(uuid) from public,anon;
grant execute on function public.disconnect_marketplace(uuid) to authenticated;

create or replace function private.record_marketplace_sync(p_id uuid)
 returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Acesso administrativo obrigatório' using errcode='42501';end if;
 update public.marketplace_connections set last_synced_at=now(),last_error=null,
  updated_at=now() where id=p_id and status='connected';
 return found;
end;
$$;
revoke all on function private.record_marketplace_sync(uuid) from public,anon;
grant execute on function private.record_marketplace_sync(uuid) to authenticated;
create or replace function public.record_marketplace_sync(p_id uuid)
 returns boolean language sql security invoker set search_path=''
as $$select private.record_marketplace_sync(p_id)$$;
revoke all on function public.record_marketplace_sync(uuid) from public,anon;
grant execute on function public.record_marketplace_sync(uuid) to authenticated;

comment on table public.marketplace_readonly_imports is
 'Anúncios e pedidos consultados (primeira página) sem PII de compradores; não modifica orders nem inventory.';
comment on table private.marketplace_token_vault is
 'Tokens OAuth cifrados com chave AES-256-GCM mantida somente no servidor; nenhum SELECT direto para usuários.';
