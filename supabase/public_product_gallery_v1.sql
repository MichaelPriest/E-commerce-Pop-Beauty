-- Galeria adicional apenas para produtos PUBLICOS não adultos.
-- A capa continua em products.image_url. Caminhos relativos garantem bucket único.
create table if not exists public.product_gallery_images (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.products(id) on delete cascade,
 storage_path text not null,
 alt_text text not null default '',
 sort_order integer not null default 0 check(sort_order between 0 and 999),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(product_id,storage_path),
 check(char_length(alt_text)<=160)
);
create index if not exists product_gallery_images_product_sort_idx
 on public.product_gallery_images(product_id,sort_order,created_at);
alter table public.product_gallery_images enable row level security;
revoke all on public.product_gallery_images from public,anon,authenticated;
grant select on public.product_gallery_images to anon,authenticated;
grant insert,update,delete on public.product_gallery_images to authenticated;
create policy gallery_public_read on public.product_gallery_images
 for select to anon,authenticated using (
  exists(select 1 from public.products p where p.id=product_id
   and p.active and not p.is_adult)
  or (select private.is_admin())
 );
create policy gallery_admin_insert on public.product_gallery_images
 for insert to authenticated with check((select private.is_admin()));
create policy gallery_admin_update on public.product_gallery_images
 for update to authenticated using((select private.is_admin()))
 with check((select private.is_admin()));
create policy gallery_admin_delete on public.product_gallery_images
 for delete to authenticated using((select private.is_admin()));

create or replace function private.validate_product_gallery_image()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_adult boolean;v_count integer;v_expected text;
begin
 -- Bloqueio do produto serializa concorrência entre uploads e alterações de idade.
 select is_adult into v_adult from public.products where id=new.product_id for update;
 if not found or v_adult then
  raise exception 'Galeria pública disponível somente para produtos não adultos';
 end if;
 v_expected:='products/gallery/'||new.product_id::text||'/';
 if left(new.storage_path,length(v_expected))<>v_expected
  or substring(new.storage_path from length(v_expected)+1)
    !~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'
  or char_length(new.storage_path)>200 then
  raise exception 'Caminho da imagem deve pertencer à galeria deste produto';
 end if;
 if tg_op='INSERT' or new.product_id is distinct from old.product_id then
  select count(*) into v_count from public.product_gallery_images
   where product_id=new.product_id;
  if v_count>=8 then raise exception 'Máximo de oito imagens adicionais por produto';end if;
 end if;
 return new;
end;
$$;
revoke all on function private.validate_product_gallery_image() from public,anon,authenticated;
create trigger validate_product_gallery before insert or update on public.product_gallery_images
 for each row execute function private.validate_product_gallery_image();

create or replace function private.prevent_gallery_adult_reclassification()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.is_adult and not old.is_adult
  and exists(select 1 from public.product_gallery_images where product_id=new.id)
 then raise exception 'Remova as imagens públicas da galeria antes de reclassificar como +18';end if;
 return new;
end;
$$;
revoke all on function private.prevent_gallery_adult_reclassification() from public,anon,authenticated;
create trigger prevent_gallery_adult_reclassification
 before update of is_adult on public.products
 for each row execute function private.prevent_gallery_adult_reclassification();
comment on table public.product_gallery_images is
 'Imagens adicionais públicas de produtos NÃO adultos; paths do bucket product-images. Máximo 8 por produto.';
