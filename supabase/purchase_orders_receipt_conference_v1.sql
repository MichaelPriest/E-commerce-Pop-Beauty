-- Apply after goods_receipts_supplier_register_atomic_v1.sql.
-- Existing receipts keep their original posting flow and cost history.
begin;

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  number integer generated always as identity unique,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  supplier_label text not null check (length(supplier_label) between 2 and 180),
  status text not null default 'draft'
    check (status in ('draft','open','partial','received','closed','cancelled')),
  expected_on date,
  notes text not null default '' check (length(notes)<=1000),
  closure_reason text not null default '' check (length(closure_reason)<=1000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  closed_at timestamptz
);

create table public.purchase_order_items (
  order_id uuid not null references public.purchase_orders(id) on delete cascade,
  variant_id uuid not null references public.variants(id) on delete restrict,
  sku_snapshot text not null,
  product_snapshot text not null,
  quantity integer not null check (quantity between 1 and 100000),
  received_quantity integer not null default 0 check (received_quantity between 0 and quantity),
  unit_cost_cents integer check (unit_cost_cents between 0 and 100000000),
  primary key (order_id,variant_id)
);

create index purchase_orders_supplier_idx on public.purchase_orders(supplier_id,number desc);
create index purchase_orders_status_idx on public.purchase_orders(status,number desc);
create index purchase_order_items_variant_idx on public.purchase_order_items(variant_id);

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
revoke all on public.purchase_orders, public.purchase_order_items from public,anon,authenticated;
grant select on public.purchase_orders, public.purchase_order_items to authenticated;
create policy purchase_orders_admin_read on public.purchase_orders for select to authenticated
  using ((select private.is_admin()));
create policy purchase_order_items_admin_read on public.purchase_order_items for select to authenticated
  using ((select private.is_admin()));

alter table public.goods_receipts
  add column purchase_order_id uuid references public.purchase_orders(id) on delete restrict,
  add column draft_token uuid,
  add column invoice_reference text not null default '' check (length(invoice_reference)<=100),
  add column invoice_lines jsonb not null default '[]'::jsonb check (jsonb_typeof(invoice_lines)='array'),
  add column invoice_warnings text[] not null default '{}',
  add column invoice_review_reason text not null default '' check (length(invoice_review_reason)<=1000);

create index goods_receipts_purchase_order_idx
  on public.goods_receipts(purchase_order_id) where purchase_order_id is not null;
create unique index goods_receipts_draft_token_idx
  on public.goods_receipts(draft_token) where draft_token is not null;
create index goods_receipts_posted_month_idx
  on public.goods_receipts(posted_at) where status='posted';

create or replace function public.save_purchase_order_draft(
  p_order_id uuid, p_payload jsonb, p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_order public.purchase_orders%rowtype;
  v_id uuid;
  v_updated_at timestamptz;
  v_supplier uuid;
  v_supplier_label text;
  v_expected_on date;
  v_notes text;
  v_items jsonb;
  v_item record;
  v_sku text;
  v_product text;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Acesso restrito a administradores' using errcode='42501';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Dados do pedido de compra inválidos';
  end if;
  v_supplier := (p_payload->>'supplier_id')::uuid;
  v_expected_on := nullif(p_payload->>'expected_on','')::date;
  v_notes := btrim(coalesce(p_payload->>'notes',''));
  v_items := p_payload->'items';
  if jsonb_typeof(v_items) is distinct from 'array' then
    raise exception 'Informe os SKUs do pedido';
  end if;
  if jsonb_array_length(v_items) not between 1 and 50 or length(v_notes)>1000 then
    raise exception 'Informe de 1 a 50 SKUs e até mil caracteres em observações';
  end if;

  if p_order_id is not null then
    select * into v_order from public.purchase_orders where id=p_order_id for update;
    if not found or v_order.status<>'draft' then
      raise exception 'Somente rascunhos podem ser editados';
    end if;
    if v_order.updated_at is distinct from p_expected_updated_at then
      raise exception 'O pedido foi alterado. Recarregue a página para continuar';
    end if;
  end if;

  select name into v_supplier_label from public.suppliers where id=v_supplier and active for share;
  if not found then raise exception 'Selecione um fornecedor ativo'; end if;
  if p_order_id is null then
    insert into public.purchase_orders(supplier_id,supplier_label,expected_on,notes,created_by,updated_by)
      values (v_supplier,v_supplier_label,v_expected_on,v_notes,auth.uid(),auth.uid())
      returning id,updated_at into v_id,v_updated_at;
  else
    update public.purchase_orders
      set supplier_id=v_supplier,supplier_label=v_supplier_label,expected_on=v_expected_on,
          notes=v_notes,updated_at=clock_timestamp(),updated_by=auth.uid()
      where id=p_order_id returning id,updated_at into v_id,v_updated_at;
    delete from public.purchase_order_items where order_id=v_id;
  end if;

  for v_item in select * from jsonb_to_recordset(v_items)
      as x(variant_id uuid,quantity integer,unit_cost_cents integer)
  loop
    if v_item.quantity is null or v_item.quantity not between 1 and 100000
      or v_item.unit_cost_cents not between 0 and 100000000 then
      raise exception 'Quantidade ou custo unitário fora do limite';
    end if;
    select v.sku,p.name into v_sku,v_product
      from public.variants v join public.products p on p.id=v.product_id
      where v.id=v_item.variant_id and v.active and p.active;
    if not found then raise exception 'SKU inexistente ou inativo'; end if;
    insert into public.purchase_order_items(order_id,variant_id,sku_snapshot,product_snapshot,quantity,unit_cost_cents)
      values (v_id,v_item.variant_id,v_sku,v_product,v_item.quantity,v_item.unit_cost_cents)
      on conflict (order_id,variant_id) do nothing;
    if not found then raise exception 'SKU % repetido',v_sku; end if;
  end loop;
  return jsonb_build_object('id',v_id,'updated_at',v_updated_at);
end;
$$;

create or replace function public.transition_purchase_order(
  p_order_id uuid, p_action text, p_reason text, p_expected_updated_at timestamptz
) returns text language plpgsql security definer set search_path=''
as $$
declare
  v_order public.purchase_orders%rowtype;
  v_status text;
  v_reason text := btrim(coalesce(p_reason,''));
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Acesso restrito a administradores' using errcode='42501';
  end if;
  select * into v_order from public.purchase_orders where id=p_order_id for update;
  if not found or v_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'O pedido mudou. Recarregue a página para continuar';
  end if;

  case
    when p_action='confirm' and v_order.status='draft' then
      perform 1 from public.suppliers where id=v_order.supplier_id and active for share;
      if not found then raise exception 'Selecione um fornecedor ativo'; end if;
      if not exists (select 1 from public.purchase_order_items where order_id=p_order_id) then
        raise exception 'O pedido precisa de pelo menos um SKU';
      end if;
      update public.purchase_orders
        set status='open',confirmed_at=now(),updated_at=clock_timestamp(),updated_by=auth.uid()
        where id=p_order_id;
      return 'open';
    when p_action='cancel' and v_order.status in ('draft','open') then v_status := 'cancelled';
    when p_action='close' and v_order.status='partial' then v_status := 'closed';
    else raise exception 'Essa alteração não se aplica à situação atual';
  end case;

  if length(v_reason) not between 1 and 1000 then
    raise exception 'Informe o motivo, com até mil caracteres';
  end if;
  update public.purchase_orders
    set status=v_status,closure_reason=v_reason,closed_at=now(),updated_at=clock_timestamp(),updated_by=auth.uid()
    where id=p_order_id;
  return v_status;
end;
$$;

-- Keep the original validation and stock posting implementations as private helpers.
alter function public.save_goods_receipt_draft(uuid,jsonb) set schema private;
alter function public.post_goods_receipt(uuid) set schema private;
revoke all on function private.save_goods_receipt_draft(uuid,jsonb),private.post_goods_receipt(uuid)
  from public,anon,authenticated;

create function public.save_goods_receipt_draft(p_receipt_id uuid, p_payload jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_receipt public.goods_receipts%rowtype;
  v_order public.purchase_orders%rowtype;
  v_id uuid;
  v_order_id uuid;
  v_expected_token uuid;
  v_next_token uuid;
  v_invoice jsonb;
  v_invoice_reference text := '';
  v_invoice_lines jsonb := '[]'::jsonb;
  v_invoice_warnings text[] := '{}';
  v_reason text := '';
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Acesso restrito a administradores' using errcode='42501';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>65536 then
    raise exception 'Dados do recebimento inválidos';
  end if;

  v_expected_token := (p_payload->>'expected_draft_token')::uuid;
  v_next_token := (p_payload->>'draft_token')::uuid;
  v_order_id := (p_payload->>'purchase_order_id')::uuid;
  v_invoice := nullif(p_payload->'invoice','null'::jsonb);

  if p_receipt_id is not null then
    select * into v_receipt from public.goods_receipts where id=p_receipt_id for update;
    if not found or v_receipt.status<>'draft' then
      raise exception 'Rascunho não encontrado ou já contabilizado';
    end if;
    if v_receipt.draft_token is distinct from v_expected_token then
      raise exception 'O rascunho mudou. Abra a versão mais recente no histórico';
    end if;
  end if;
  if (v_order_id is not null or v_invoice is not null or v_expected_token is not null)
      and v_next_token is null then
    raise exception 'Atualize a página de recebimento para usar a conferência';
  end if;

  if v_order_id is not null then
    select * into v_order from public.purchase_orders where id=v_order_id for share;
    if not found or v_order.status not in ('open','partial') then
      raise exception 'O pedido de compra não está aberto para recebimento';
    end if;
    if v_order.supplier_id is distinct from (p_payload->>'supplier_id')::uuid then
      raise exception 'O fornecedor do recebimento deve corresponder ao do pedido';
    end if;
    p_payload := p_payload || jsonb_build_object('supplier_label',v_order.supplier_label);
  end if;

  if v_invoice is not null then
    v_invoice_reference := btrim(coalesce(v_invoice->>'reference',''));
    v_reason := btrim(coalesce(v_invoice->>'review_reason',''));
    if jsonb_typeof(v_invoice) is distinct from 'object'
      or length(v_invoice_reference) not between 1 and 100 or length(v_reason)>1000
      or jsonb_typeof(v_invoice->'lines') is distinct from 'array'
      or jsonb_typeof(v_invoice->'warnings') is distinct from 'array' then
      raise exception 'Conferência da nota inválida';
    end if;
    if jsonb_array_length(v_invoice->'lines')>50 or jsonb_array_length(v_invoice->'warnings')>200 then
      raise exception 'Conferência da nota excede o limite de linhas';
    end if;
    select coalesce(array_agg(left(value,400)),'{}'::text[]) into v_invoice_warnings
      from jsonb_array_elements_text(v_invoice->'warnings');
    if jsonb_array_length(v_invoice->'lines')=0 and cardinality(v_invoice_warnings)=0 then
      raise exception 'A conferência precisa de itens identificados ou avisos do XML';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'variant_id',v.id,'sku',v.sku,'product',p.name,'quantity',x.quantity
    ) order by v.sku),'[]'::jsonb)
      into v_invoice_lines
      from jsonb_to_recordset(v_invoice->'lines') as x(variant_id uuid,quantity integer)
        join public.variants v on v.id=x.variant_id
        join public.products p on p.id=v.product_id
      where x.quantity between 1 and 5000000;
    if jsonb_array_length(v_invoice_lines)<>jsonb_array_length(v_invoice->'lines')
      or exists (select 1 from jsonb_array_elements(v_invoice_lines)
          group by value->>'variant_id' having count(*)>1) then
      raise exception 'SKUs ou quantidades da nota inválidos';
    end if;
  end if;

  v_id := private.save_goods_receipt_draft(p_receipt_id,p_payload);
  update public.goods_receipts
    set purchase_order_id=v_order_id,draft_token=v_next_token,invoice_reference=v_invoice_reference,
        invoice_lines=v_invoice_lines,invoice_warnings=v_invoice_warnings,invoice_review_reason=v_reason
    where id=v_id;
  return v_id;
end;
$$;

create function public.post_goods_receipt(p_receipt_id uuid, p_draft_token uuid default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_receipt public.goods_receipts%rowtype;
  v_order public.purchase_orders%rowtype;
  v_sku text;
  v_result jsonb;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Acesso restrito a administradores' using errcode='42501';
  end if;
  select * into v_receipt from public.goods_receipts where id=p_receipt_id for update;
  if not found then raise exception 'Recebimento não encontrado'; end if;
  if v_receipt.status<>'draft' then raise exception 'Recebimento já contabilizado'; end if;
  if v_receipt.draft_token is distinct from p_draft_token then
    raise exception 'O rascunho mudou. Abra a versão mais recente no histórico';
  end if;

  if v_receipt.invoice_reference<>'' and v_receipt.invoice_review_reason='' and (
    cardinality(v_receipt.invoice_warnings)>0 or exists (
      select 1 from jsonb_to_recordset(v_receipt.invoice_lines) as n(variant_id uuid,quantity integer)
      full join (
        select variant_id,sum(quantity) as quantity from public.goods_receipt_items
          where receipt_id=p_receipt_id group by variant_id
      ) f using (variant_id)
      where coalesce(n.quantity,0)<>coalesce(f.quantity,0)
    )
  ) then
    raise exception 'Registre a justificativa da divergência entre a nota e a mercadoria';
  end if;

  if v_receipt.purchase_order_id is not null then
    select * into v_order from public.purchase_orders where id=v_receipt.purchase_order_id for update;
    if not found or v_order.status not in ('open','partial')
      or v_order.supplier_id is distinct from v_receipt.supplier_id then
      raise exception 'O pedido de compra não está aberto para este recebimento';
    end if;
    select f.sku into v_sku from (
      select variant_id,min(sku_snapshot) as sku,sum(quantity) as quantity
      from public.goods_receipt_items where receipt_id=p_receipt_id group by variant_id
    ) f
    left join public.purchase_order_items i on i.order_id=v_order.id and i.variant_id=f.variant_id
    where i.variant_id is null or f.quantity>i.quantity-i.received_quantity
    order by f.sku limit 1;
    if found then
      raise exception 'O SKU % não consta no pedido ou excede o saldo a receber',v_sku;
    end if;
  end if;

  v_result := private.post_goods_receipt(p_receipt_id);
  if v_receipt.purchase_order_id is not null then
    update public.purchase_order_items i set received_quantity=i.received_quantity+f.quantity
      from (select variant_id,sum(quantity)::integer as quantity from public.goods_receipt_items
        where receipt_id=p_receipt_id group by variant_id) f
      where i.order_id=v_order.id and i.variant_id=f.variant_id;

    update public.purchase_orders set status=case when exists (
        select 1 from public.purchase_order_items where order_id=v_order.id and received_quantity<quantity
      ) then 'partial' else 'received' end, updated_at=clock_timestamp(),updated_by=auth.uid()
      where id=v_order.id;
  end if;
  return v_result;
end;
$$;

revoke all on function public.save_purchase_order_draft(uuid,jsonb,timestamptz),
  public.transition_purchase_order(uuid,text,text,timestamptz),
  public.save_goods_receipt_draft(uuid,jsonb),public.post_goods_receipt(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.save_purchase_order_draft(uuid,jsonb,timestamptz),
  public.transition_purchase_order(uuid,text,text,timestamptz),
  public.save_goods_receipt_draft(uuid,jsonb),public.post_goods_receipt(uuid,uuid) to authenticated;

create function public.admin_goods_receipt_costs(p_month date)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Acesso restrito a administradores' using errcode='42501';
  end if;
  if p_month is null or not isfinite(p_month) or extract(day from p_month)<>1 then
    raise exception 'Informe o primeiro dia do mês';
  end if;
  v_start := p_month::timestamp at time zone 'America/Sao_Paulo';
  v_end := (p_month+interval '1 month') at time zone 'America/Sao_Paulo';

  with receipts as materialized (
    select r.id,r.supplier_id,coalesce(s.name,r.supplier_label) as supplier_label,
      r.reference,r.posted_at,o.number as purchase_order_number,
      sum(i.quantity) as units,
      coalesce(sum(i.quantity) filter (where i.unit_cost_cents is null),0) as units_without_cost,
      coalesce(sum(i.quantity::bigint*i.unit_cost_cents),0) as cost_cents
    from public.goods_receipts r
    join public.goods_receipt_items i on i.receipt_id=r.id
    left join public.suppliers s on s.id=r.supplier_id
    left join public.purchase_orders o on o.id=r.purchase_order_id
    where r.status='posted' and r.posted_at>=v_start and r.posted_at<v_end
    group by r.id,s.name,o.number
  ), suppliers as (
    select supplier_id,supplier_label,count(*) as receipts,sum(units) as units,
      sum(units_without_cost) as units_without_cost,sum(cost_cents)::text as cost_cents
    from receipts group by supplier_id,supplier_label
  ), recent as (
    select id,supplier_label,reference,posted_at,purchase_order_number,units,units_without_cost,cost_cents::text
    from receipts order by posted_at desc,id limit 50
  )
  select jsonb_build_object(
    'totals',(select jsonb_build_object('receipts',count(*),'units',coalesce(sum(units),0),
      'units_without_cost',coalesce(sum(units_without_cost),0),'cost_cents',coalesce(sum(cost_cents),0)::text)
      from receipts),
    'suppliers',(select coalesce(jsonb_agg(to_jsonb(s) order by supplier_label,supplier_id),'[]'::jsonb) from suppliers s),
    'recent',(select coalesce(jsonb_agg(to_jsonb(r) order by posted_at desc,id),'[]'::jsonb) from recent r)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.admin_goods_receipt_costs(date) from public,anon,authenticated;
grant execute on function public.admin_goods_receipt_costs(date) to authenticated;
notify pgrst, 'reload schema';
commit;
