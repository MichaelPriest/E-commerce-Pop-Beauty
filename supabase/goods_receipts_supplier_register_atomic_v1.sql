-- Fornecedores e recebimentos em duas fases (rascunho -> contabilizado).
-- Nenhum SKU ou saldo existente é modificado ao instalar a migração.
create table if not exists public.suppliers (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(btrim(name)) between 2 and 180),
 tax_id text unique check(tax_id is null or tax_id ~ '^[0-9]{11}([0-9]{3})?$'),
 email text check(email is null or (length(email)<=254 and email like '%@%')),
 phone text check(phone is null or length(phone)<=30),
 notes text not null default '' check(length(notes)<=1000),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.goods_receipts (
 id uuid primary key default gen_random_uuid(),
 supplier_id uuid references public.suppliers(id) on delete restrict,
 supplier_label text not null check(length(btrim(supplier_label)) between 2 and 180),
 reference text not null default '' check(length(reference)<=100),
 document_date date,
 notes text not null default '' check(length(notes)<=1000),
 status text not null default 'draft' check(status in ('draft','posted')),
 created_by uuid references auth.users(id) on delete set null,
 posted_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 posted_at timestamptz,
 check((status='draft' and posted_at is null and posted_by is null)
    or (status='posted' and posted_at is not null and posted_by is not null))
);
create table if not exists public.goods_receipt_items (
 id uuid primary key default gen_random_uuid(),
 receipt_id uuid not null references public.goods_receipts(id) on delete cascade,
 variant_id uuid not null references public.variants(id) on delete restrict,
 sku_snapshot text not null check(length(sku_snapshot) between 2 and 80),
 product_snapshot text not null check(length(product_snapshot) between 2 and 200),
 lot_code text not null check(length(btrim(lot_code)) between 1 and 60),
 expires_at date,
 quantity integer not null check(quantity between 1 and 100000),
 unit_cost_cents integer check(unit_cost_cents is null or unit_cost_cents between 0 and 100000000),
 unique(receipt_id,variant_id,lot_code)
);
create index if not exists goods_receipts_recent_idx on public.goods_receipts(created_at desc);
create index if not exists goods_receipts_supplier_idx on public.goods_receipts(supplier_id,created_at desc);
create index if not exists goods_receipt_items_variant_idx on public.goods_receipt_items(variant_id);
alter table public.suppliers enable row level security;
alter table public.goods_receipts enable row level security;
alter table public.goods_receipt_items enable row level security;
revoke all on public.suppliers,public.goods_receipts,public.goods_receipt_items
 from public,anon,authenticated;
grant select,insert,update on public.suppliers to authenticated;
grant select on public.goods_receipts,public.goods_receipt_items to authenticated;
create policy suppliers_admin_read on public.suppliers for select to authenticated
 using ((select private.is_admin()));
create policy suppliers_admin_insert on public.suppliers for insert to authenticated
 with check ((select private.is_admin()));
create policy suppliers_admin_update on public.suppliers for update to authenticated
 using ((select private.is_admin())) with check ((select private.is_admin()));
create policy receipts_admin_read on public.goods_receipts for select to authenticated
 using ((select private.is_admin()));
create policy receipt_items_admin_read on public.goods_receipt_items for select to authenticated
 using ((select private.is_admin()));

create or replace function public.save_goods_receipt_draft(
 p_receipt_id uuid,p_payload jsonb
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
 v_id uuid;v_supplier uuid;v_label text;v_reference text;v_date date;
 v_notes text;v_items jsonb;v_count integer;v_row jsonb;
 v_variant uuid;v_sku text;v_name text;v_lot text;v_expiry date;
 v_quantity integer;v_cost integer;v_index integer:=0;
 v_seen text[]:=array[]::text[];
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administradores podem salvar recebimentos'
    using errcode='42501';
 end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then
  raise exception 'Informações inválidas';
 end if;
 v_label:=btrim(coalesce(p_payload->>'supplier_label',''));
 v_reference:=btrim(coalesce(p_payload->>'reference',''));
 v_notes:=btrim(coalesce(p_payload->>'notes',''));
 if length(v_label) not between 2 and 180
  or length(v_reference)>100 or length(v_notes)>1000 then
  raise exception 'Fornecedor, documento ou observações inválidos';
 end if;
 if nullif(btrim(coalesce(p_payload->>'supplier_id','')),'') is not null then
  v_supplier:=(p_payload->>'supplier_id')::uuid;
  perform 1 from public.suppliers where id=v_supplier and active;
  if not found then raise exception 'Fornecedor não encontrado ou inativo';end if;
 end if;
 if nullif(btrim(coalesce(p_payload->>'document_date','')),'') is not null then
  v_date:=(p_payload->>'document_date')::date;
 end if;
 v_items:=p_payload->'items';
 if v_items is null or jsonb_typeof(v_items)<>'array' then
  raise exception 'Informe os itens do recebimento';
 end if;
 v_count:=jsonb_array_length(v_items);
 if v_count not between 1 and 25 then
  raise exception 'Recebimento deve ter de 1 a 25 itens';
 end if;
 if p_receipt_id is not null then
  select id into v_id from public.goods_receipts where id=p_receipt_id
   and status='draft' for update;
  if not found then raise exception 'Rascunho não encontrado ou já contabilizado';end if;
  update public.goods_receipts set supplier_id=v_supplier,supplier_label=v_label,
   reference=v_reference,document_date=v_date,notes=v_notes,updated_at=now()
   where id=v_id;
  delete from public.goods_receipt_items where receipt_id=v_id;
 else
  insert into public.goods_receipts(
   supplier_id,supplier_label,reference,document_date,notes,created_by
  ) values(v_supplier,v_label,v_reference,v_date,v_notes,auth.uid())
  returning id into v_id;
 end if;
 for v_row in select value from jsonb_array_elements(v_items) loop
  v_index:=v_index+1;
  if jsonb_typeof(v_row)<>'object' then
   raise exception 'Linha %: formato inválido',v_index;end if;
  v_variant:=(v_row->>'variant_id')::uuid;
  v_lot:=btrim(coalesce(v_row->>'lot_code',''));
  if length(v_lot) not between 1 and 60 then
   raise exception 'Linha %: lote obrigatório (até 60 caracteres)',v_index;
  end if;
  if (v_row->>'quantity') !~ '^[1-9][0-9]{0,5}$' then
   raise exception 'Linha %: quantidade inválida',v_index;
  end if;
  v_quantity:=(v_row->>'quantity')::integer;
  if v_quantity>100000 then
   raise exception 'Linha %: quantidade deve ser até 100000',v_index;end if;
  v_expiry:=null;
  if nullif(btrim(coalesce(v_row->>'expires_at','')),'') is not null then
   v_expiry:=(v_row->>'expires_at')::date;
   if v_expiry < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Linha %: não é permitido receber mercadoria vencida',v_index;
   end if;
  end if;
  v_cost:=null;
  if nullif(btrim(coalesce(v_row->>'unit_cost_cents','')),'') is not null then
   if (v_row->>'unit_cost_cents') !~ '^[0-9]{1,9}$' then
    raise exception 'Linha %: custo inválido',v_index;end if;
   v_cost:=(v_row->>'unit_cost_cents')::integer;
   if v_cost>100000000 then
    raise exception 'Linha %: custo fora do limite',v_index;end if;
  end if;
  select v.sku,p.name into v_sku,v_name
   from public.variants v join public.products p on p.id=v.product_id
   where v.id=v_variant;
  if not found then raise exception 'Linha %: SKU não encontrado',v_index;end if;
  if (v_variant::text||':'||v_lot)=any(v_seen) then
   raise exception 'Linha %: SKU e lote repetidos',v_index;end if;
  v_seen:=array_append(v_seen,v_variant::text||':'||v_lot);
  insert into public.goods_receipt_items(
   receipt_id,variant_id,sku_snapshot,product_snapshot,lot_code,
   expires_at,quantity,unit_cost_cents
  ) values(v_id,v_variant,v_sku,v_name,v_lot,v_expiry,v_quantity,v_cost);
 end loop;
 return v_id;
end;
$$;

create or replace function public.post_goods_receipt(p_receipt_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_receipt public.goods_receipts%rowtype;
 v_item record;v_total integer:=0;v_lines integer:=0;v_reason text;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administradores podem contabilizar entradas'
   using errcode='42501';
 end if;
 select * into v_receipt from public.goods_receipts
  where id=p_receipt_id for update;
 if not found then raise exception 'Recebimento não encontrado';end if;
 if v_receipt.status<>'draft' then
  raise exception 'Recebimento já contabilizado; entrada duplicada bloqueada';
 end if;
 v_reason:='Recebimento '||left(v_receipt.reference,45)||
   ' / '||left(v_receipt.supplier_label,75);
 for v_item in
  select variant_id,lot_code,expires_at,quantity
  from public.goods_receipt_items where receipt_id=p_receipt_id
  order by variant_id,lot_code
 loop
  if v_item.expires_at is not null and
   v_item.expires_at<(now() at time zone 'America/Sao_Paulo')::date then
   raise exception 'Item venceu após rascunho; revise antes de contabilizar';
  end if;
  perform public.adjust_stock(v_item.variant_id,v_item.quantity,
   v_reason,v_item.lot_code,v_item.expires_at);
  v_total:=v_total+v_item.quantity;
  v_lines:=v_lines+1;
 end loop;
 if v_lines<1 then raise exception 'Nenhum item para contabilizar';end if;
 update public.goods_receipts set status='posted',posted_at=now(),
  posted_by=auth.uid(),updated_at=now()
  where id=p_receipt_id;
 return jsonb_build_object('receipt_id',p_receipt_id,'status','posted',
   'lines',v_lines,'units',v_total);
end;
$$;
revoke all on function public.save_goods_receipt_draft(uuid,jsonb),
 public.post_goods_receipt(uuid) from public,anon,authenticated;
grant execute on function public.save_goods_receipt_draft(uuid,jsonb),
 public.post_goods_receipt(uuid) to authenticated;
comment on function public.post_goods_receipt(uuid) is
 'Conta uma única vez com row lock. Movimentos de lote + status são atômicos; erro causa rollback de todos.';
