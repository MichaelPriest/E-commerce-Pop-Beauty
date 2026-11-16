-- Fotos específicas de SKU sem multiplicar arquivos nem perder a galeria existente.
-- variant_id NULL = foto geral do produto. Relação composta garante que a cor
-- pertence precisamente ao produto da foto (inclusive após edições concorrentes).
alter table public.product_gallery_images
 add column if not exists variant_id uuid;

do $do$
begin
 if not exists (
  select 1 from pg_constraint where conrelid='public.variants'::regclass
   and conname='variants_id_product_id_unique'
 ) then
  alter table public.variants
   add constraint variants_id_product_id_unique unique(id,product_id);
 end if;
end;
$do$;

do $do$
begin
 if not exists (
  select 1 from pg_constraint
   where conrelid='public.product_gallery_images'::regclass
    and conname='gallery_variant_belongs_to_product_fkey'
 ) then
  alter table public.product_gallery_images
   add constraint gallery_variant_belongs_to_product_fkey
   foreign key(variant_id,product_id)
   references public.variants(id,product_id)
   on update restrict on delete set null (variant_id);
 end if;
end;
$do$;
create index if not exists product_gallery_images_variant_idx
 on public.product_gallery_images(product_id,variant_id,sort_order);
comment on column public.product_gallery_images.variant_id is
 'NULL: foto geral. UUID: foto específica do SKU deste produto. Protegido por FK composta; ao excluir SKU, a foto vira geral.';
