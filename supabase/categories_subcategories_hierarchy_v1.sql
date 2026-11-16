-- Categorias (parent_id NULL) e subcategorias (parent_id da categoria raiz).
-- Reutiliza category_id dos produtos e preserva todos os registros existentes.
alter table public.categories
 add column if not exists parent_id uuid references public.categories(id) on delete restrict;
create index if not exists categories_parent_position_idx
 on public.categories(parent_id,position,name);
alter table public.categories
 add constraint categories_not_own_parent check(parent_id is null or parent_id<>id);

create or replace function private.guard_category_hierarchy()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_parent public.categories%rowtype;
begin
 if new.name is null or length(btrim(new.name)) not between 2 and 100 then
  raise exception 'Nome da categoria deve ter entre 2 e 100 caracteres';
 end if;
 if new.slug is null or length(new.slug)>160
    or new.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
  raise exception 'Endereço (slug) de categoria inválido';
 end if;
 if new.parent_id is not null then
  if new.parent_id=new.id then raise exception 'Categoria não pode ser sua própria mãe';end if;
  select * into v_parent from public.categories where id=new.parent_id for share;
  if not found then raise exception 'Categoria principal não encontrada';end if;
  if v_parent.parent_id is not null then
   raise exception 'Somente dois níveis são aceitos: categoria e subcategoria';
  end if;
  if new.is_adult is distinct from v_parent.is_adult then
   raise exception 'Subcategoria e categoria principal devem ter a mesma classificação etária';
  end if;
  if new.active and not v_parent.active then
   raise exception 'Não é possível ativar subcategoria de categoria principal inativa';
  end if;
 end if;
 if tg_op='UPDATE' then
  if new.parent_id is distinct from old.parent_id and
   (exists(select 1 from public.products where category_id=old.id)
    or exists(select 1 from public.categories where parent_id=old.id)) then
   raise exception 'Não é permitido mover categorias com produtos ou subcategorias vinculados';
  end if;
  if old.active and not new.active and
   (exists(select 1 from public.products where category_id=new.id and active)
    or exists(select 1 from public.categories where parent_id=new.id and active)) then
   raise exception 'Antes de desativar, mova/desative produtos e subcategorias ativos';
  end if;
  if exists(select 1 from public.categories where parent_id=new.id)
    and (new.parent_id is not null or new.is_adult is distinct from old.is_adult) then
   raise exception 'Categoria principal com subcategorias não pode ser reclassificada';
  end if;
 end if;
 return new;
end;
$$;
revoke all on function private.guard_category_hierarchy() from public,anon,authenticated;
drop trigger if exists pope_category_hierarchy_guard on public.categories;
create trigger pope_category_hierarchy_guard
 before insert or update on public.categories
 for each row execute function private.guard_category_hierarchy();

create or replace function private.guard_active_product_category()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_category public.categories%rowtype;v_parent_active boolean;
begin
 if new.active and new.category_id is not null then
  select * into v_category from public.categories where id=new.category_id;
  if not found or not v_category.active then
   raise exception 'Produto ativo precisa de categoria ativa';
  end if;
  if v_category.parent_id is not null then
   select c.active into v_parent_active from public.categories c
    where c.id=v_category.parent_id;
   if v_parent_active is distinct from true then
    raise exception 'A categoria principal do produto precisa estar ativa';
   end if;
  end if;
 end if;
 return new;
end;
$$;
revoke all on function private.guard_active_product_category() from public,anon,authenticated;
drop trigger if exists pope_active_product_category on public.products;
create trigger pope_active_product_category
 before insert or update of category_id,active on public.products
 for each row execute function private.guard_active_product_category();

comment on column public.categories.parent_id is
 'NULL para categoria principal; UUID de uma categoria principal para subcategoria. No máximo dois níveis.';
