-- Avaliações de produtos feitas exclusivamente por clientes autenticados.
-- Publicação depende da moderação da equipe Popê; sem compra verificada automática.
begin;
create table public.product_reviews (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.products(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 author_name text not null default 'Cliente Popê',
 rating smallint not null check(rating between 1 and 5),
 comment text not null check(length(btrim(comment)) between 10 and 1200),
 status text not null default 'pending' check(status in ('pending','published','hidden')),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(product_id,user_id)
);
create index product_reviews_public_idx
 on public.product_reviews(product_id,created_at desc)
 where status='published';
create index product_reviews_moderation_idx
 on public.product_reviews(status,created_at desc);
create index product_reviews_author_idx
 on public.product_reviews(user_id,created_at desc);
alter table public.product_reviews enable row level security;
revoke all on public.product_reviews from public,anon,authenticated;
grant select on public.product_reviews to anon,authenticated;
grant insert(product_id,user_id,rating,comment,status)
 on public.product_reviews to authenticated;
grant update(status) on public.product_reviews to authenticated;
create policy product_reviews_public_read on public.product_reviews
 for select to anon,authenticated
 using (status='published'
  and exists(select 1 from public.products p where p.id=product_id
   and p.active and not p.is_adult));
create policy product_reviews_owner_staff_read on public.product_reviews
 for select to authenticated
 using(user_id=(select auth.uid()) or (select private.is_feed_editor()));
create policy product_reviews_customer_create on public.product_reviews
 for insert to authenticated
 with check (
  user_id=(select auth.uid())
  and coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false
  and status='pending'
  and exists(select 1 from public.products p where p.id=product_id
   and p.active and not p.is_adult)
 );
create policy product_reviews_team_moderation on public.product_reviews
 for update to authenticated
 using ((select private.is_feed_editor()))
 with check ((select private.is_feed_editor()));

create or replace function private.guard_product_review()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_label text;
begin
 if TG_OP='UPDATE' then
  if new.product_id is distinct from old.product_id
   or new.user_id is distinct from old.user_id
   or new.rating is distinct from old.rating
   or new.comment is distinct from old.comment
   or new.author_name is distinct from old.author_name
   or new.created_at is distinct from old.created_at then
   raise exception 'Avaliação não pode ter autoria ou conteúdo alterados';
  end if;
  if not private.is_feed_editor() then
   raise exception 'Somente a equipe pode moderar avaliações' using errcode='42501';
  end if;
  new.updated_at=clock_timestamp();
  return new;
 end if;
 if new.user_id is distinct from auth.uid() then
  raise exception 'A avaliação deve pertencer ao cliente autenticado'
   using errcode='42501';
 end if;
 if not exists(select 1 from public.products p where p.id=new.product_id
  and p.active and not p.is_adult) then
  raise exception 'Produto indisponível para avaliação';
 end if;
 new.comment=btrim(new.comment);
 select nullif(btrim(p.display_name),'') into v_label
  from public.profiles p where p.id=new.user_id;
 new.author_name=left(coalesce(v_label,'Cliente Popê'),60);
 return new;
end;
$$;
revoke all on function private.guard_product_review() from public,anon,authenticated;
create trigger guard_product_review before insert or update on public.product_reviews
 for each row execute function private.guard_product_review();

create function public.product_review_summary(p_product_id uuid)
returns table(average_rating numeric,rating_count bigint)
language sql stable security invoker set search_path=''
as $$
 select coalesce(round(avg(r.rating)::numeric,1),0)::numeric,
  count(*)::bigint
 from public.product_reviews r
 where r.product_id=p_product_id and r.status='published'
$$;
revoke all on function public.product_review_summary(uuid)
 from public,anon,authenticated;
grant execute on function public.product_review_summary(uuid)
 to anon,authenticated;
notify pgrst,'reload schema';
commit;
