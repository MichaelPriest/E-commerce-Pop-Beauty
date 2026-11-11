-- Popê Beauty — banco dedicado. Executar somente em um projeto Supabase novo.
-- Todos os preços em centavos de real. Operações de estoque deverão usar transações servidoras.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '',
 role text not null default 'customer' check (role in ('customer','staff','admin')),
 created_at timestamptz not null default now()
);
create table if not exists public.categories (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique,
 name text not null,
 active boolean not null default true,
 position int not null default 0
);
create table if not exists public.products (
 id uuid primary key default gen_random_uuid(),
 category_id uuid references public.categories(id),
 slug text not null unique,
 name text not null,
 description text not null default '',
 brand text not null default 'Popê Beauty',
 price_cents int not null check (price_cents>=0),
 compare_at_cents int check (compare_at_cents is null or compare_at_cents>=0),
 image_url text,
 active boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists public.variants (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.products(id) on delete cascade,
 sku text not null unique,
 name text not null default 'Padrão',
 shade text,
 ean text,
 active boolean not null default true
);
create table if not exists public.inventory (
 variant_id uuid primary key references public.variants(id) on delete cascade,
 on_hand int not null default 0 check (on_hand>=0),
 reserved int not null default 0 check (reserved>=0 and reserved<=on_hand),
 safety_stock int not null default 0 check (safety_stock>=0),
 updated_at timestamptz not null default now()
);
create table if not exists public.orders (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid references auth.users(id) on delete set null,
 channel text not null check (channel in ('store','shopee','mercadolivre')),
 external_order_id text,
 status text not null default 'pending' check (status in ('pending','paid','packing','shipped','delivered','cancelled','refunded')),
 total_cents int not null default 0 check (total_cents>=0),
 created_at timestamptz not null default now(),
 unique (channel,external_order_id)
);
create table if not exists public.order_items (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete cascade,
 variant_id uuid references public.variants(id) on delete set null,
 sku_snapshot text not null,
 title_snapshot text not null,
 quantity int not null check (quantity>0),
 unit_price_cents int not null check (unit_price_cents>=0)
);
create table if not exists public.stock_movements (
 id uuid primary key default gen_random_uuid(),
 variant_id uuid not null references public.variants(id),
 delta int not null,
 reason text not null,
 order_id uuid references public.orders(id),
 created_at timestamptz not null default now()
);
create table if not exists public.marketplace_listings (
 id uuid primary key default gen_random_uuid(),
 variant_id uuid not null references public.variants(id) on delete cascade,
 channel text not null check (channel in ('shopee','mercadolivre')),
 external_listing_id text not null,
 last_synced_at timestamptz,
 sync_status text not null default 'pending',
 unique(channel,external_listing_id)
);
create index if not exists idx_products_category_active on public.products(category_id,active);
create index if not exists idx_orders_customer_recent on public.orders(customer_id,created_at desc);
create index if not exists idx_orders_channel_recent on public.orders(channel,created_at desc);
create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_stock_movements_variant on public.stock_movements(variant_id,created_at desc);
create index if not exists idx_marketplace_listings_variant on public.marketplace_listings(variant_id);

-- Funções internas: security definer necessário somente para checagem de papel sem recursão de RLS.
-- Não expor o schema private na API pública.
create or replace function private.is_staff() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (
 select 1 from public.profiles where id=(select auth.uid()) and role in ('staff','admin')
) $$;
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (
 select 1 from public.profiles where id=(select auth.uid()) and role='admin'
) $$;
revoke all on function private.is_staff() from public;
revoke all on function private.is_admin() from public;
grant execute on function private.is_staff() to anon, authenticated;
grant execute on function private.is_admin() to authenticated;

create or replace function private.create_profile_for_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
 insert into public.profiles(id, display_name, role)
 values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),'customer')
 on conflict(id) do nothing;
 return new;
end;
$$;
revoke all on function private.create_profile_for_new_user() from public;
drop trigger if exists on_auth_user_created_pope on auth.users;
create trigger on_auth_user_created_pope
after insert on auth.users for each row execute function private.create_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.variants enable row level security;
alter table public.inventory enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.marketplace_listings enable row level security;

-- Perfis: cliente vê somente seu perfil; equipe autorizada vê perfis.
create policy "profiles_self_or_staff_read" on public.profiles for select to authenticated
 using (id=(select auth.uid()) or (select private.is_staff()));
create policy "profiles_self_display_name_update" on public.profiles for update to authenticated
 using (id=(select auth.uid())) with check (id=(select auth.uid()));
-- GRANT por coluna impede alterar 'role' pela API mesmo com o UPDATE acima.
-- Revogar quaisquer privilégios UPDATE em nível de tabela (Supabase pode concedê-los por padrão).
-- RLS controla linhas, mas não impede por si só que um usuário altere sua coluna de papel.
revoke update on public.profiles from public, anon, authenticated;
revoke insert, delete on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update(display_name) on public.profiles to authenticated;

create policy "categories_public_read" on public.categories for select to anon,authenticated
 using (active or (select private.is_staff()));
create policy "categories_admin_insert" on public.categories for insert to authenticated
 with check ((select private.is_admin()));
create policy "categories_admin_update" on public.categories for update to authenticated
 using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "categories_admin_delete" on public.categories for delete to authenticated
 using ((select private.is_admin()));
grant select on public.categories to anon,authenticated;
grant insert,update,delete on public.categories to authenticated;

create policy "products_catalog_read" on public.products for select to anon,authenticated
 using (active or (select private.is_staff()));
create policy "products_admin_insert" on public.products for insert to authenticated
 with check ((select private.is_admin()));
create policy "products_admin_update" on public.products for update to authenticated
 using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "products_admin_delete" on public.products for delete to authenticated
 using ((select private.is_admin()));
grant select on public.products to anon,authenticated;
grant insert,update,delete on public.products to authenticated;

create policy "variants_catalog_read" on public.variants for select to anon,authenticated
 using ((active and exists(select 1 from public.products p where p.id=product_id and p.active)) or (select private.is_staff()));
create policy "variants_admin_insert" on public.variants for insert to authenticated with check ((select private.is_admin()));
create policy "variants_admin_update" on public.variants for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "variants_admin_delete" on public.variants for delete to authenticated using ((select private.is_admin()));
grant select on public.variants to anon,authenticated;
grant insert,update,delete on public.variants to authenticated;

create policy "inventory_staff_read" on public.inventory for select to authenticated
 using ((select private.is_staff()));
create policy "inventory_admin_insert" on public.inventory for insert to authenticated with check ((select private.is_admin()));
create policy "inventory_admin_update" on public.inventory for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "inventory_admin_delete" on public.inventory for delete to authenticated using ((select private.is_admin()));
grant select,insert,update,delete on public.inventory to authenticated;

create policy "orders_own_or_staff_read" on public.orders for select to authenticated
 using (customer_id=(select auth.uid()) or (select private.is_staff()));
create policy "orders_admin_insert" on public.orders for insert to authenticated with check ((select private.is_admin()));
create policy "orders_admin_update" on public.orders for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
grant select,insert,update on public.orders to authenticated;

create policy "order_items_own_or_staff_read" on public.order_items for select to authenticated
 using ((select private.is_staff()) or exists(select 1 from public.orders o where o.id=order_id and o.customer_id=(select auth.uid())));
create policy "order_items_admin_insert" on public.order_items for insert to authenticated with check ((select private.is_admin()));
grant select,insert on public.order_items to authenticated;

create policy "stock_movements_staff_read" on public.stock_movements for select to authenticated using ((select private.is_staff()));
create policy "stock_movements_admin_insert" on public.stock_movements for insert to authenticated with check ((select private.is_admin()));
grant select,insert on public.stock_movements to authenticated;

create policy "marketplace_listings_staff_read" on public.marketplace_listings for select to authenticated using ((select private.is_staff()));
create policy "marketplace_listings_admin_insert" on public.marketplace_listings for insert to authenticated with check ((select private.is_admin()));
create policy "marketplace_listings_admin_update" on public.marketplace_listings for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
grant select,insert,update on public.marketplace_listings to authenticated;

insert into public.categories(slug,name,position) values
 ('make','Make',1),('skincare','Skincare',2),('acessorios','Acessórios',3),('kits','Kits',4)
on conflict (slug) do nothing;

-- Passo administrativo manual, APÓS cadastro do dono via Supabase Auth:
-- update public.profiles set role='admin' where id=(select id from auth.users where email='<email do dono>');
-- O e-mail acima deve ser substituído diretamente no SQL Editor do projeto dedicado.
