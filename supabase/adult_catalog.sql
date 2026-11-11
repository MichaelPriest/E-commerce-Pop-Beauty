-- Popê Beauty: área adulta isolada e desligada por padrão.
-- Regras de autorização estão no PostgreSQL / Storage, não apenas na interface.
create table if not exists public.store_settings (
 id smallint primary key default 1 check(id=1),
 adult_enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
insert into public.store_settings(id,adult_enabled) values(1,false) on conflict(id) do nothing;
alter table public.store_settings enable row level security;
create policy "settings_read_flag" on public.store_settings for select to anon,authenticated using(true);
create policy "settings_admin_update" on public.store_settings for update to authenticated
 using ((select private.is_admin())) with check ((select private.is_admin()));
revoke all on public.store_settings from public, anon, authenticated;
grant select on public.store_settings to anon, authenticated;
grant update(adult_enabled) on public.store_settings to authenticated;

create table if not exists public.age_verification_requests (
 user_id uuid primary key references auth.users(id) on delete cascade,
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 requested_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id)
);
alter table public.age_verification_requests enable row level security;
create policy "age_requests_own_or_admin_read" on public.age_verification_requests for select to authenticated
 using (user_id=(select auth.uid()) or (select private.is_admin()));
create policy "age_requests_self_insert" on public.age_verification_requests for insert to authenticated
 with check (user_id=(select auth.uid()) and status='pending' and reviewed_at is null and reviewed_by is null);
create policy "age_requests_admin_update" on public.age_verification_requests for update to authenticated
 using ((select private.is_admin())) with check ((select private.is_admin()));
revoke all on public.age_verification_requests from public,anon,authenticated;
grant select,insert on public.age_verification_requests to authenticated;
grant update(status,reviewed_at,reviewed_by) on public.age_verification_requests to authenticated;

create table if not exists public.age_verifications (
 user_id uuid primary key references auth.users(id) on delete cascade,
 method text not null check (method in ('manual_document','verified_provider')),
 verified_at timestamptz not null default now(),
 expires_at timestamptz not null,
 verified_by uuid references auth.users(id)
);
create index if not exists idx_age_verifications_expiration on public.age_verifications(expires_at);
alter table public.age_verifications enable row level security;
create policy "age_verification_own_or_admin_read" on public.age_verifications for select to authenticated
 using (user_id=(select auth.uid()) or (select private.is_admin()));
create policy "age_verification_admin_insert" on public.age_verifications for insert to authenticated
 with check ((select private.is_admin()));
create policy "age_verification_admin_update" on public.age_verifications for update to authenticated
 using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "age_verification_admin_delete" on public.age_verifications for delete to authenticated
 using ((select private.is_admin()));
revoke all on public.age_verifications from public,anon,authenticated;
grant select,insert,update,delete on public.age_verifications to authenticated;

-- Chamada interna autorizada: flag habilitada E verificação válida.
-- SECURITY DEFINER fica em schema privado não exposto à REST API.
create or replace function private.can_view_adult() returns boolean
 language sql stable security definer set search_path=''
as $$
 select (select auth.uid()) is not null
   and exists (select 1 from public.store_settings s where s.id=1 and s.adult_enabled)
   and exists (
     select 1 from public.age_verifications v
     where v.user_id=(select auth.uid())
       and v.verified_at<=now() and v.expires_at>now()
   )
$$;
revoke all on function private.can_view_adult() from public;
grant execute on function private.can_view_adult() to anon,authenticated;

alter table public.categories add column if not exists is_adult boolean not null default false;
alter table public.products add column if not exists is_adult boolean not null default false;

insert into public.categories(slug,name,position,active,is_adult)
values('sex-shop-adulto','Sex Shop +18',90,true,true)
on conflict(slug) do update set is_adult=true, name=excluded.name;

-- Categorias adultas nunca aparecem para contas não verificadas.
drop policy if exists "categories_public_read" on public.categories;
create policy "categories_public_read" on public.categories for select to anon,authenticated
 using ((active and (not is_adult or (select private.can_view_adult()))) or (select private.is_staff()));

drop policy if exists "products_catalog_read" on public.products;
create policy "products_catalog_read" on public.products for select to anon,authenticated
 using ((active and (not is_adult or (select private.can_view_adult()))) or (select private.is_staff()));

drop policy if exists "variants_catalog_read" on public.variants;
create policy "variants_catalog_read" on public.variants for select to anon,authenticated
 using (
   (active and exists (
     select 1 from public.products p where p.id=product_id and p.active
      and (not p.is_adult or (select private.can_view_adult()))
   )) or (select private.is_staff())
 );

-- Classificação obrigatória definida pela categoria, independente de payload do navegador.
create or replace function private.set_product_age_classification() returns trigger
 language plpgsql security definer set search_path=''
as $$
declare category_adult boolean;
begin
 select c.is_adult into category_adult from public.categories c where c.id=new.category_id;
 if new.category_id is not null and not found then raise exception 'Categoria inválida'; end if;
 new.is_adult:=coalesce(category_adult,false);
 if new.is_adult then
   -- Produtos +18 nunca expõem imagens externas ou do bucket público.
   if new.image_url is not null and
      new.image_url !~ '^adult-products:products/[a-f0-9-]{36}[.](jpg|png|webp)$' then
      raise exception 'Imagem adulta precisa ser enviada ao armazenamento privado.';
   end if;
 else
   if new.image_url like 'adult-products:%' then
     raise exception 'Imagem adulta privada não pode ser atribuída ao catálogo comum.';
   end if;
 end if;
 return new;
end;
$$;
revoke all on function private.set_product_age_classification() from public;
drop trigger if exists pope_product_age_category on public.products;
create trigger pope_product_age_category before insert or update of category_id,image_url,is_adult
 on public.products for each row execute function private.set_product_age_classification();

-- Bucket privado: imagens devem ser baixadas somente após validação no servidor.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('adult-products','adult-products',false,5242880,array['image/jpeg','image/png','image/webp'])
 on conflict(id) do update set public=false;
create policy "pope_adult_images_admin_insert" on storage.objects for insert to authenticated
 with check (bucket_id='adult-products' and (select private.is_admin()));
create policy "pope_adult_images_authenticated_read" on storage.objects for select to authenticated
 using (bucket_id='adult-products' and ((select private.is_admin()) or (select private.can_view_adult())));
create policy "pope_adult_images_admin_delete" on storage.objects for delete to authenticated
 using (bucket_id='adult-products' and (select private.is_admin()));

-- Aprovação atômica após inspeção real de prova de idade por administrador.
-- Não armazena documento, foto ou data de nascimento.
create or replace function public.review_age_verification(
 p_user_id uuid, p_approved boolean, p_method text default 'manual_document'
) returns boolean language plpgsql security invoker set search_path=''
as $$
declare v_status text;
begin
 if not private.is_admin() then raise exception 'Somente administradores podem revisar solicitações' using errcode='42501'; end if;
 if p_user_id is null or p_user_id=(select auth.uid()) then raise exception 'Conta inválida para revisão'; end if;
 if p_approved is null then raise exception 'Decisão inválida'; end if;
 if p_approved and p_method not in ('manual_document','verified_provider') then
   raise exception 'Método de verificação inválido';
 end if;
 select status into v_status from public.age_verification_requests
   where user_id=p_user_id for update;
 if not found or v_status<>'pending' then raise exception 'Nenhuma solicitação pendente para esta conta'; end if;
 if p_approved then
   insert into public.age_verifications(user_id,method,verified_at,expires_at,verified_by)
    values(p_user_id,p_method,now(),now()+interval '365 days',(select auth.uid()))
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

-- Desativação invalida imediatamente todas as permissões de visualização sem apagar
-- as verificações registradas. Nenhuma verificação autoriza acesso sem a flag.

-- Bloqueia troca arbitrária da classificação de categorias já utilizadas.
create or replace function private.prevent_category_age_flip() returns trigger
 language plpgsql set search_path=''
as $$
begin
 if new.is_adult is distinct from old.is_adult and
    exists(select 1 from public.products where category_id=old.id) then
   raise exception 'Não é possível alterar classificação etária de categoria com produtos cadastrados';
 end if;
 return new;
end;
$$;
drop trigger if exists pope_prevent_category_age_flip on public.categories;
create trigger pope_prevent_category_age_flip before update of is_adult
 on public.categories for each row execute function private.prevent_category_age_flip();
