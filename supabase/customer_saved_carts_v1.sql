-- Carrinhos Popê: sincronização somente para clientes autenticados.
-- Valores são SEMPRE calculados a partir do catálogo pelo servidor, nunca deste snapshot.
-- Mensagens de recuperação exigem autorização separada e NÃO são enviadas por esta migração.
begin;
create table public.customer_saved_carts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 items jsonb not null default '[]'::jsonb,
 item_count integer not null default 0 check (item_count between 0 and 2970),
 last_activity_at timestamptz not null default clock_timestamp(),
 created_at timestamptz not null default clock_timestamp(),
 reminders_opt_in boolean not null default false,
 review_state text not null default 'new' check(review_state in ('new','reviewing','closed')),
 reviewed_at timestamptz,
 check (jsonb_typeof(items)='array'),
 check (jsonb_array_length(items)<=30)
);
create index customer_saved_carts_abandoned_idx on public.customer_saved_carts
 (last_activity_at desc) where item_count>0 and review_state<>'closed';
alter table public.customer_saved_carts enable row level security;
revoke all on public.customer_saved_carts from public,anon,authenticated;
grant select on public.customer_saved_carts to authenticated;
grant update(review_state) on public.customer_saved_carts to authenticated;
create policy saved_cart_own_read on public.customer_saved_carts
 for select to authenticated using (user_id=(select auth.uid()));
create policy saved_cart_admin_read on public.customer_saved_carts
 for select to authenticated using ((select private.is_admin()));
create policy saved_cart_admin_triage on public.customer_saved_carts
 for update to authenticated using ((select private.is_admin()))
 with check ((select private.is_admin()));

create function private.saved_cart_review_guard()
 returns trigger language plpgsql set search_path=''
as $$
begin
 if new.review_state is distinct from old.review_state then
  new.reviewed_at=case when new.review_state='new' then null else clock_timestamp() end;
 end if;
 return new;
end
$$;
revoke all on function private.saved_cart_review_guard() from public,anon,authenticated;
create trigger saved_cart_review_guard
 before update of review_state on public.customer_saved_carts
 for each row execute function private.saved_cart_review_guard();

create function public.save_customer_cart(p_items jsonb) returns integer
language plpgsql security definer set search_path=''
as $$
declare
 v_user uuid:=auth.uid();
 v_record jsonb;
 v_product text; v_variant text; v_qty_text text;
 v_pid uuid; v_vid uuid;
 v_qty integer; v_sum integer:=0;
 v_clean jsonb:='[]'::jsonb;
 v_keys text[]:=array[]::text[];
 v_key text;
begin
 if v_user is null
  or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
  raise exception 'Entre na conta para salvar o carrinho' using errcode='42501';
 end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>30 then
  raise exception 'Carrinho inválido: máximo de 30 itens' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('cart:'||v_user::text,0));
 for v_record in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(v_record)<>'object' then
   raise exception 'Linha do carrinho inválida' using errcode='22023';
  end if;
  v_product:=v_record->>'product_id';
  v_variant:=v_record->>'variant_id';
  v_qty_text:=v_record->>'quantity';
  if v_product is null or v_product !~ '^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$'
   or v_qty_text is null or v_qty_text !~ '^[1-9][0-9]?$'
   or (v_variant is not null and v_variant !~ '^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$') then
   raise exception 'Identificação ou quantidade inválida' using errcode='22023';
  end if;
  v_pid:=v_product::uuid;
  v_vid:=case when v_variant is null then null else v_variant::uuid end;
  v_qty:=v_qty_text::integer;
  if not exists(select 1 from public.products p where p.id=v_pid
   and p.active and not p.is_adult) then
   raise exception 'Produto não disponível para salvar' using errcode='22023';
  end if;
  if v_vid is not null and not exists(select 1 from public.variants v
   where v.id=v_vid and v.product_id=v_pid and v.active) then
   raise exception 'Variação inválida' using errcode='22023';
  end if;
  v_key:=v_pid::text||':'||coalesce(v_vid::text,'default');
  if v_key=any(v_keys) then
   raise exception 'Linha duplicada no carrinho' using errcode='22023';
  end if;
  v_keys:=array_append(v_keys,v_key);
  v_sum:=v_sum+v_qty;
  v_clean:=v_clean||jsonb_build_array(jsonb_build_object(
   'product_id',v_pid,'variant_id',v_vid,'quantity',v_qty
  ));
 end loop;

 insert into public.customer_saved_carts(user_id,items,item_count,last_activity_at,review_state)
 values(v_user,v_clean,v_sum,clock_timestamp(),'new')
 on conflict(user_id) do update
 set items=excluded.items,item_count=excluded.item_count,
  last_activity_at=excluded.last_activity_at,review_state='new';
 return v_sum;
end
$$;
revoke all on function public.save_customer_cart(jsonb) from public,anon,authenticated;
grant execute on function public.save_customer_cart(jsonb) to authenticated;

create function public.set_saved_cart_reminders(p_enabled boolean) returns boolean
language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
  or p_enabled is null then
  raise exception 'Sessão ou opção inválida' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('cart:'||v_user::text,0));
 insert into public.customer_saved_carts(user_id,reminders_opt_in)
 values(v_user,p_enabled)
 on conflict(user_id) do update set reminders_opt_in=excluded.reminders_opt_in;
 return p_enabled;
end
$$;
revoke all on function public.set_saved_cart_reminders(boolean) from public,anon,authenticated;
grant execute on function public.set_saved_cart_reminders(boolean) to authenticated;
notify pgrst,'reload schema';
commit;
