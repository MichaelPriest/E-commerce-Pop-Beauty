-- Proibir mudar categoria para +18 enquanto houver imagem em bucket público.
drop trigger if exists prevent_gallery_adult_reclassification on public.products;
create trigger prevent_gallery_adult_reclassification
 before update of category_id,is_adult on public.products
 for each row execute function private.prevent_gallery_adult_reclassification();

-- Reorganização atômica da galeria; não permite reordenar fotos alheias.
create or replace function public.reorder_product_gallery(
 p_product_id uuid,p_image_ids uuid[]
) returns integer
language plpgsql security definer set search_path=''
as $$
declare v_count integer;v_given integer;v_changed integer;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administradores podem ordenar imagens' using errcode='42501';
 end if;
 if p_product_id is null or p_image_ids is null then
  raise exception 'Produto e imagens obrigatórios';
 end if;
 -- Impede upload concorrente durante o reordenamento.
 perform 1 from public.products where id=p_product_id and not is_adult for update;
 if not found then raise exception 'Produto público não encontrado';end if;
 select count(*) into v_count from public.product_gallery_images where product_id=p_product_id;
 select count(distinct x) into v_given from unnest(p_image_ids) x;
 if v_count<>coalesce(array_length(p_image_ids,1),0)
   or v_given<>v_count or v_count>8 then
  raise exception 'Lista de imagens não corresponde à galeria deste produto';
 end if;
 if exists(select 1 from unnest(p_image_ids) x
  where not exists(select 1 from public.product_gallery_images g
   where g.id=x and g.product_id=p_product_id)) then
  raise exception 'Imagem não pertence ao produto';
 end if;
 with ordered as (
  select x.id,(x.ordinality-1)::integer as position
  from unnest(p_image_ids) with ordinality as x(id,ordinality)
 )
 update public.product_gallery_images g set sort_order=ordered.position
 from ordered where g.id=ordered.id and g.product_id=p_product_id;
 get diagnostics v_changed=row_count;
 return v_changed;
end;
$$;
revoke all on function public.reorder_product_gallery(uuid,uuid[])
 from public,anon,authenticated;
grant execute on function public.reorder_product_gallery(uuid,uuid[]) to authenticated;
comment on function public.reorder_product_gallery(uuid,uuid[]) is
 'Reordenar galeria pública com autorização admin e verificação exata do conjunto de imagens.';
