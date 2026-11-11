-- Índices de chaves estrangeiras e bloqueio defensivo de anúncios +18.
create index if not exists idx_age_requests_reviewer on public.age_verification_requests(reviewed_by);
create index if not exists idx_age_verifications_reviewer on public.age_verifications(verified_by);
create index if not exists idx_order_events_actor on public.order_events(actor_id);
create index if not exists idx_stock_movements_lot on public.stock_movements(lot_id);

create or replace function private.prevent_adult_marketplace_link() returns trigger
 language plpgsql security invoker set search_path=''
as $$
declare is_adult boolean;
begin
 select p.is_adult into is_adult from public.variants v
 join public.products p on p.id=v.product_id
 where v.id=new.variant_id;
 if not found then raise exception 'SKU não encontrado';end if;
 if is_adult then raise exception 'Produtos +18 não podem ser vinculados aos marketplaces nesta fase';end if;
 return new;
end;
$$;
revoke all on function private.prevent_adult_marketplace_link() from public;
drop trigger if exists pope_marketplace_adult_guard on public.marketplace_listings;
create trigger pope_marketplace_adult_guard before insert or update of variant_id on public.marketplace_listings
 for each row execute function private.prevent_adult_marketplace_link();
