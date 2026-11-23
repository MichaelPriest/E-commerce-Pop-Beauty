-- Popê Beauty — feed social com moderação, mídia privada e produtos do catálogo.
-- Somente conteúdo publicado é visível no feed público.
begin;
-- Apenas administradores e funcionários podem criar postagens.
create or replace function private.is_feed_editor() returns boolean
 language sql stable security definer set search_path=''
 as $select exists(select 1 from public.profiles p
 where p.id=(select auth.uid()) and p.role in ('admin','staff'))$;
revoke all on function private.is_feed_editor() from public,anon,authenticated;
create table if not exists public.feed_posts (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references auth.users(id) on delete cascade,
 author_name text not null default 'Comunidade Popê',
 body text not null default '' check (length(body)<=2000),
 media_path text unique,
 media_kind text check (media_kind in ('image','video')),
 product_id uuid references public.products(id) on delete set null,
 category_id uuid references public.categories(id) on delete set null,
 status text not null default 'pending'
  check (status in ('pending','published','rejected','hidden')),
 like_count integer not null default 0 check(like_count>=0),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 published_at timestamptz,
 constraint feed_post_requires_content check (length(btrim(body))>0 or media_path is not null),
 constraint feed_post_media_pair check ((media_path is null)=(media_kind is null))
);
create index if not exists feed_posts_public_idx
 on public.feed_posts(published_at desc,id desc) where status='published';
create index if not exists feed_posts_moderation_idx
 on public.feed_posts(status,created_at desc);
create index if not exists feed_posts_author_idx
 on public.feed_posts(author_id,created_at desc);
create index if not exists feed_posts_category_idx
 on public.feed_posts(category_id,published_at desc) where status='published';
create index if not exists feed_posts_product_idx
 on public.feed_posts(product_id,published_at desc) where status='published';
alter table public.feed_posts enable row level security;
revoke all on public.feed_posts from public,anon,authenticated;
grant select on public.feed_posts to anon,authenticated;
grant insert(author_id,body,media_path,media_kind,product_id,category_id,status)
 on public.feed_posts to authenticated;
grant update(status) on public.feed_posts to authenticated;

create policy feed_posts_public_read on public.feed_posts for select to anon,authenticated
 using (status='published'
 and (product_id is null or exists (select 1 from public.products p where p.id=product_id and p.active and not p.is_adult))
 and (category_id is null or exists (select 1 from public.categories c where c.id=category_id and c.active and not c.is_adult))
);
create policy feed_posts_owner_admin_read on public.feed_posts for select to authenticated
 using (author_id=(select auth.uid()) or (select private.is_feed_editor()));
create policy feed_posts_create on public.feed_posts for insert to authenticated
 with check (
  author_id=(select auth.uid()) and (select private.is_feed_editor()) and
  coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false
  and status in ('pending','published')
 );
create policy feed_posts_admin_status on public.feed_posts for update to authenticated
 using ((select private.is_feed_editor()))
 with check ((select private.is_feed_editor()));

create or replace function private.guard_feed_post()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_parent uuid;v_category uuid;v_label text;
begin
 if TG_OP='UPDATE' then
  if new.author_id is distinct from old.author_id
   or new.body is distinct from old.body
   or new.media_path is distinct from old.media_path
   or new.media_kind is distinct from old.media_kind
   or new.product_id is distinct from old.product_id
   or new.category_id is distinct from old.category_id
   or new.author_name is distinct from old.author_name
   or new.created_at is distinct from old.created_at then
   raise exception 'Não é permitido alterar o conteúdo ou a autoria de uma postagem';
  end if;
  if new.status is distinct from old.status and not private.is_feed_editor() then
   raise exception 'Somente a moderação altera o status' using errcode='42501';
  end if;
  if old.status is distinct from 'published' and new.status='published' then
   new.published_at=clock_timestamp();
  elsif new.status is distinct from old.status and new.status<>'published' then
   new.published_at=null;
  end if;
  new.updated_at=clock_timestamp();
  return new;
 end if;

 if new.author_id is distinct from auth.uid() or not private.is_feed_editor() then
  raise exception 'Autor inválido' using errcode='42501';
 end if;
 new.body=btrim(new.body);
 if length(new.body)=0 and new.media_path is null then
  raise exception 'Inclua texto, imagem ou vídeo';
 end if;
 if new.media_path is not null then
  if new.media_path !~ ('^'||new.author_id::text||'/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|mp4|webm)$') then
   raise exception 'Arquivo fora da pasta do autor';
  end if;
  if (new.media_kind='image' and new.media_path !~ '\.(jpg|jpeg|png|webp)$')
    or (new.media_kind='video' and new.media_path !~ '\.(mp4|webm)$') then
   raise exception 'Tipo de mídia inválido';
  end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='pope-feed-media'
   and o.name=new.media_path and o.owner_id=new.author_id::text) then
   raise exception 'Arquivo não encontrado no armazenamento privado';
  end if;
 end if;
 if new.category_id is not null then
  select c.parent_id into v_parent from public.categories c
   where c.id=new.category_id and c.active and not c.is_adult;
  if not found then raise exception 'Categoria indisponível'; end if;
 end if;
 if new.product_id is not null then
  select p.category_id into v_category from public.products p
  where p.id=new.product_id and p.active and not p.is_adult;
  if not found then raise exception 'Produto indisponível'; end if;
  if new.category_id is not null and new.category_id<>v_category and
   new.category_id is distinct from
    (select parent_id from public.categories where id=v_category) then
   raise exception 'Produto não pertence à categoria selecionada';
  end if;
 end if;
 select nullif(btrim(p.display_name),'') into v_label
  from public.profiles p where p.id=new.author_id;
 new.author_name=left(coalesce(v_label,'Comunidade Popê'),60);
 if private.is_feed_editor() and new.status='published' then
  new.published_at=clock_timestamp();
 end if;
 if private.is_feed_editor() then
  perform pg_advisory_xact_lock(hashtextextended('feed-post:'||new.author_id::text,0));
  if (select count(*) from public.feed_posts p where p.author_id=new.author_id
   and p.created_at>clock_timestamp()-interval '24 hours')>=30 then
   raise exception 'Limite de trinta postagens por dia atingido';
  end if;
 end if;
 return new;
end;
$$;
revoke all on function private.guard_feed_post() from public,anon,authenticated;
drop trigger if exists guard_feed_post on public.feed_posts;
create trigger guard_feed_post before insert or update on public.feed_posts
for each row execute function private.guard_feed_post();

create table if not exists public.feed_post_likes (
 post_id uuid not null references public.feed_posts(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 primary key(post_id,user_id)
);
create index if not exists feed_post_likes_owner_idx on public.feed_post_likes(user_id);
alter table public.feed_post_likes enable row level security;
revoke all on public.feed_post_likes from public,anon,authenticated;
grant select,insert,delete on public.feed_post_likes to authenticated;
create policy feed_likes_owner_read on public.feed_post_likes for select to authenticated
 using(user_id=(select auth.uid()));
create policy feed_likes_owner_insert on public.feed_post_likes for insert to authenticated
 with check(
  user_id=(select auth.uid())
  and coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false
  and exists(select 1 from public.feed_posts p where p.id=post_id and p.status='published')
 );
create policy feed_likes_owner_delete on public.feed_post_likes for delete to authenticated
 using(user_id=(select auth.uid()));
create or replace function private.refresh_feed_post_like_count()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 update public.feed_posts set like_count=(
  select count(*) from public.feed_post_likes l
  where l.post_id=coalesce(new.post_id,old.post_id)
 ) where id=coalesce(new.post_id,old.post_id);
 return null;
end;
$$;
revoke all on function private.refresh_feed_post_like_count() from public,anon,authenticated;
drop trigger if exists refresh_feed_post_like_count on public.feed_post_likes;
create trigger refresh_feed_post_like_count
after insert or delete on public.feed_post_likes
for each row execute function private.refresh_feed_post_like_count();

-- Arquivos são privados até a moderação publicar o post.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('pope-feed-media','pope-feed-media',false,26214400,
 array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict (id) do update set
 public=false,file_size_limit=excluded.file_size_limit,
 allowed_mime_types=excluded.allowed_mime_types;

create policy pope_feed_upload_owner on storage.objects for insert to authenticated
 with check (
  bucket_id='pope-feed-media' and
  (select private.is_feed_editor()) and
  coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false and
  (storage.foldername(name))[1]=(select auth.uid())::text and
  name ~ ('^'||(select auth.uid())::text||'/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|mp4|webm)$')
 );
create policy pope_feed_media_read on storage.objects for select to anon,authenticated
 using (
  bucket_id='pope-feed-media' and
  (exists(select 1 from public.feed_posts p where p.media_path=name
   and p.status='published')
   or ((select auth.uid()) is not null and (storage.foldername(name))[1]=(select auth.uid())::text)
   or (select private.is_feed_editor()))
 );
create policy pope_feed_media_cleanup on storage.objects for delete to authenticated
 using (
  bucket_id='pope-feed-media'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and not exists(select 1 from public.feed_posts p where p.media_path=name)
 );

notify pgrst,'reload schema';
commit;
