-- Popê Beauty: rascunhos fiscais, atributos fiscais e embalagens internas.
-- Nenhum documento fiscal é transmitido/autorizado, nenhuma etiqueta é comprada.
create table if not exists public.product_fiscal_details (
 product_id uuid primary key references public.products(id) on delete cascade,
 ncm text check(ncm is null or ncm ~ '^[0-9]{8}$'),
 cest text check(cest is null or cest ~ '^[0-9]{7}$'),
 tax_origin smallint check(tax_origin is null or tax_origin between 0 and 8),
 commercial_unit text check(commercial_unit is null or commercial_unit ~ '^[A-Z0-9]{1,6}$'),
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now()
);
alter table public.product_fiscal_details enable row level security;
revoke all on public.product_fiscal_details from public,anon,authenticated;
grant select on public.product_fiscal_details to authenticated;
drop policy if exists "product_fiscal_admin_read" on public.product_fiscal_details;
create policy "product_fiscal_admin_read" on public.product_fiscal_details
 for select to authenticated using((select private.is_admin()));

create table if not exists public.fiscal_order_drafts (
 order_id uuid primary key references public.orders(id) on delete cascade,
 fiscal_model text not null check(fiscal_model in ('55','65')),
 operation_nature text check(operation_nature is null or char_length(operation_nature)<=120),
 review_notes text check(review_notes is null or char_length(review_notes)<=600),
 status text not null default 'draft' check(status='draft'),
 updated_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.fiscal_order_drafts enable row level security;
revoke all on public.fiscal_order_drafts from public,anon,authenticated;
grant select on public.fiscal_order_drafts to authenticated;
drop policy if exists "fiscal_drafts_admin_read" on public.fiscal_order_drafts;
create policy "fiscal_drafts_admin_read" on public.fiscal_order_drafts
 for select to authenticated using((select private.is_admin()));

create table if not exists public.internal_package_preparations (
 order_id uuid primary key references public.orders(id) on delete cascade,
 volumes integer not null default 1 check(volumes between 1 and 50),
 packing_notes text check(packing_notes is null or char_length(packing_notes)<=400),
 weight_g integer check(weight_g is null or weight_g between 1 and 500000),
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now()
);
alter table public.internal_package_preparations enable row level security;
revoke all on public.internal_package_preparations from public,anon,authenticated;
grant select on public.internal_package_preparations to authenticated;
drop policy if exists "internal_package_admin_read" on public.internal_package_preparations;
create policy "internal_package_admin_read" on public.internal_package_preparations
 for select to authenticated using((select private.is_admin()));

create or replace function private.save_product_fiscal_details(
 p_product_id uuid,p_ncm text,p_cest text,p_origin integer,p_unit text
) returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administradores podem alterar dados fiscais' using errcode='42501';
 end if;
 if p_product_id is null or not exists(select 1 from public.products where id=p_product_id)
  or p_ncm is not null and p_ncm !~ '^[0-9]{8}$'
  or p_cest is not null and p_cest !~ '^[0-9]{7}$'
  or p_origin is not null and (p_origin<0 or p_origin>8)
  or p_unit is not null and p_unit !~ '^[A-Z0-9]{1,6}$' then
  raise exception 'Dados fiscais inválidos; confira com a contabilidade';
 end if;
 insert into public.product_fiscal_details
  (product_id,ncm,cest,tax_origin,commercial_unit,updated_by,updated_at)
 values(p_product_id,p_ncm,p_cest,p_origin,p_unit,auth.uid(),now())
 on conflict(product_id) do update set
  ncm=excluded.ncm,cest=excluded.cest,tax_origin=excluded.tax_origin,
  commercial_unit=excluded.commercial_unit,updated_by=auth.uid(),updated_at=now();
 return true;
end;
$$;
revoke all on function private.save_product_fiscal_details(uuid,text,text,integer,text) from public,anon;
grant execute on function private.save_product_fiscal_details(uuid,text,text,integer,text) to authenticated;
create or replace function public.save_product_fiscal_details(
 p_product_id uuid,p_ncm text,p_cest text,p_origin integer,p_unit text
) returns boolean language sql security invoker set search_path=''
as $$select private.save_product_fiscal_details(p_product_id,p_ncm,p_cest,p_origin,p_unit)$$;
revoke all on function public.save_product_fiscal_details(uuid,text,text,integer,text) from public,anon;
grant execute on function public.save_product_fiscal_details(uuid,text,text,integer,text) to authenticated;

create or replace function private.save_fiscal_order_draft(
 p_order_id uuid,p_model text,p_operation text,p_notes text
) returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administradores podem preparar documentos fiscais' using errcode='42501';
 end if;
 if p_order_id is null or p_model not in ('55','65')
  or char_length(coalesce(p_operation,''))>120
  or char_length(coalesce(p_notes,''))>600
  or not exists(select 1 from public.orders
   where id=p_order_id and origin='admin_manual') then
  raise exception 'Pedido ou modelo de rascunho inválido';
 end if;
 insert into public.fiscal_order_drafts
 (order_id,fiscal_model,operation_nature,review_notes,status,updated_by,updated_at)
 values(p_order_id,p_model,nullif(btrim(p_operation),''),nullif(btrim(p_notes),''),
  'draft',auth.uid(),now())
 on conflict(order_id) do update set fiscal_model=excluded.fiscal_model,
  operation_nature=excluded.operation_nature,review_notes=excluded.review_notes,
  status='draft',updated_by=auth.uid(),updated_at=now();
 return true;
end;
$$;
revoke all on function private.save_fiscal_order_draft(uuid,text,text,text) from public,anon;
grant execute on function private.save_fiscal_order_draft(uuid,text,text,text) to authenticated;
create or replace function public.save_fiscal_order_draft(
 p_order_id uuid,p_model text,p_operation text,p_notes text
) returns boolean language sql security invoker set search_path=''
as $$select private.save_fiscal_order_draft(p_order_id,p_model,p_operation,p_notes)$$;
revoke all on function public.save_fiscal_order_draft(uuid,text,text,text) from public,anon;
grant execute on function public.save_fiscal_order_draft(uuid,text,text,text) to authenticated;

create or replace function private.save_internal_package_preparation(
 p_order_id uuid,p_volumes integer,p_weight_g integer,p_notes text
) returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administradores podem preparar volumes' using errcode='42501';
 end if;
 if p_order_id is null or p_volumes not between 1 and 50
  or p_weight_g is not null and p_weight_g not between 1 and 500000
  or char_length(coalesce(p_notes,''))>400
  or not exists(select 1 from public.orders where id=p_order_id
    and origin='admin_manual' and status in('paid','packing','shipped','delivered')) then
  raise exception 'Pedido ou embalagem inválida; confirme a separação';
 end if;
 insert into public.internal_package_preparations
 (order_id,volumes,weight_g,packing_notes,updated_by,updated_at)
 values(p_order_id,p_volumes,p_weight_g,nullif(btrim(p_notes),''),auth.uid(),now())
 on conflict(order_id) do update set volumes=excluded.volumes,
  weight_g=excluded.weight_g,packing_notes=excluded.packing_notes,
  updated_by=auth.uid(),updated_at=now();
 return true;
end;
$$;
revoke all on function private.save_internal_package_preparation(uuid,integer,integer,text) from public,anon;
grant execute on function private.save_internal_package_preparation(uuid,integer,integer,text) to authenticated;
create or replace function public.save_internal_package_preparation(
 p_order_id uuid,p_volumes integer,p_weight_g integer,p_notes text
) returns boolean language sql security invoker set search_path=''
as $$select private.save_internal_package_preparation(p_order_id,p_volumes,p_weight_g,p_notes)$$;
revoke all on function public.save_internal_package_preparation(uuid,integer,integer,text) from public,anon;
grant execute on function public.save_internal_package_preparation(uuid,integer,integer,text) to authenticated;

comment on table public.fiscal_order_drafts is
 'Rascunho administrativo: não é NF-e/NFC-e, não tem chave de acesso, XML assinado, protocolo SEFAZ ou valor fiscal autorizado.';
comment on table public.internal_package_preparations is
 'Preparação de volume e etiqueta INTERNA, sem frete contratado, PLP, autorização postal ou rastreio criado.';
