-- Popê Beauty: cadastro interno de cupons, sem autorização para aplicar descontos em pedidos.
-- As campanhas ficam restritas à administração até a integração transacional de checkout.
begin;

create table if not exists public.promotion_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code ~ '^[A-Z0-9][A-Z0-9_-]{3,23}$' and code=upper(btrim(code))),
  description text not null default ''
    check (length(description)<=180),
  discount_type text not null check (discount_type in ('percent','fixed')),
  discount_value integer not null
    check (discount_value between 1 and 100000000),
  min_subtotal_cents integer not null default 0
    check (min_subtotal_cents between 0 and 100000000),
  max_discount_cents integer
    check (max_discount_cents is null or max_discount_cents between 1 and 100000000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotion_coupon_amount_check check (
    (discount_type='percent' and discount_value between 1 and 90)
    or (discount_type='fixed' and discount_value between 100 and 100000000
      and max_discount_cents is null)
  ),
  constraint promotion_coupon_period_check check (ends_at > starts_at)
);
create index if not exists promotion_coupons_active_period_idx
  on public.promotion_coupons(enabled,starts_at,ends_at);
create index if not exists promotion_coupons_recent_idx
  on public.promotion_coupons(created_at desc);

alter table public.promotion_coupons enable row level security;
revoke all on public.promotion_coupons from public,anon,authenticated;
grant select on public.promotion_coupons to authenticated;
grant insert(code,description,discount_type,discount_value,min_subtotal_cents,
  max_discount_cents,starts_at,ends_at,enabled)
  on public.promotion_coupons to authenticated;
grant update(code,description,discount_type,discount_value,min_subtotal_cents,
  max_discount_cents,starts_at,ends_at,enabled)
  on public.promotion_coupons to authenticated;

drop policy if exists promotion_coupons_admin_select on public.promotion_coupons;
create policy promotion_coupons_admin_select on public.promotion_coupons
  for select to authenticated using ((select private.is_admin()));
drop policy if exists promotion_coupons_admin_insert on public.promotion_coupons;
create policy promotion_coupons_admin_insert on public.promotion_coupons
  for insert to authenticated with check ((select private.is_admin()));
drop policy if exists promotion_coupons_admin_update on public.promotion_coupons;
create policy promotion_coupons_admin_update on public.promotion_coupons
  for update to authenticated using ((select private.is_admin()))
  with check ((select private.is_admin()));

create or replace function private.touch_promotion_coupon()
returns trigger language plpgsql set search_path=''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.touch_promotion_coupon() from public,anon,authenticated;
drop trigger if exists touch_promotion_coupon on public.promotion_coupons;
create trigger touch_promotion_coupon before update
  on public.promotion_coupons for each row
  execute function private.touch_promotion_coupon();

-- A ausência de RPC pública de resgate é intencional. Nunca debitar pedidos
-- usando cálculos vindos do navegador; a integração deverá ser atômica no banco.
commit;
