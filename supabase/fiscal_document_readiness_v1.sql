
create table if not exists public.fiscal_issuer_settings (
 id smallint primary key default 1 check(id=1),
 legal_name text not null default '' check(length(legal_name)<=180),
 trade_name text not null default '' check(length(trade_name)<=180),
 cnpj text not null default '' check(cnpj='' or cnpj ~ '^[0-9]{14}$'),
 state_registration text not null default '' check(length(state_registration)<=18),
 tax_regime smallint check(tax_regime in (1,2,3,4)),
 state_code text not null default 'SP' check(state_code ~ '^[A-Z]{2}$'),
 city text not null default '' check(length(city)<=100),
 city_ibge_code text not null default '' check(city_ibge_code='' or city_ibge_code ~ '^[0-9]{7}$'),
 postal_code text not null default '' check(postal_code='' or postal_code ~ '^[0-9]{8}$'),
 street text not null default '' check(length(street)<=160),
 house_number text not null default '' check(length(house_number)<=20),
 district text not null default '' check(length(district)<=100),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null
);
insert into public.fiscal_issuer_settings(id) values(1) on conflict do nothing;
alter table public.fiscal_issuer_settings enable row level security;
revoke all on public.fiscal_issuer_settings from public,anon,authenticated;
grant select on public.fiscal_issuer_settings to authenticated;
drop policy if exists "fiscal_issuer_admin_read" on public.fiscal_issuer_settings;
create policy "fiscal_issuer_admin_read" on public.fiscal_issuer_settings
 for select to authenticated using((select private.is_admin()));

alter table public.product_fiscal_details
 add column if not exists cfop_sale text check(cfop_sale is null or cfop_sale ~ '^[0-9]{4}$'),
 add column if not exists icms_cst text check(icms_cst is null or icms_cst ~ '^[0-9]{2}$'),
 add column if not exists csosn text check(csosn is null or csosn ~ '^[0-9]{3}$'),
 add column if not exists pis_cst text check(pis_cst is null or pis_cst ~ '^[0-9]{2}$'),
 add column if not exists cofins_cst text check(cofins_cst is null or cofins_cst ~ '^[0-9]{2}$'),
 add column if not exists cst_ibs_cbs text check(cst_ibs_cbs is null or cst_ibs_cbs ~ '^[0-9]{3}$'),
 add column if not exists class_trib_ibs_cbs text check(class_trib_ibs_cbs is null or class_trib_ibs_cbs ~ '^[0-9]{6}$');

create table if not exists public.fiscal_order_recipients (
 order_id uuid primary key references public.orders(id) on delete cascade,
 full_name text not null check(length(full_name) between 2 and 160),
 tax_id text check(tax_id is null or tax_id ~ '^([0-9]{11}|[0-9]{14})$'),
 state_registration text check(state_registration is null or length(state_registration)<=18),
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now()
);
alter table public.fiscal_order_recipients enable row level security;
revoke all on public.fiscal_order_recipients from public,anon,authenticated;
grant select on public.fiscal_order_recipients to authenticated;
drop policy if exists "fiscal_recipient_admin_read" on public.fiscal_order_recipients;
create policy "fiscal_recipient_admin_read" on public.fiscal_order_recipients
 for select to authenticated using((select private.is_admin()));

create table if not exists public.fiscal_document_integration (
 order_id uuid primary key references public.orders(id) on delete cascade,
 environment text not null default 'homologacao' check(environment in ('homologacao','producao')),
 status text not null default 'not_submitted' check(status='not_submitted'),
 created_at timestamptz not null default now()
);
alter table public.fiscal_document_integration enable row level security;
revoke all on public.fiscal_document_integration from public,anon,authenticated;
grant select on public.fiscal_document_integration to authenticated;
drop policy if exists "fiscal_integration_admin_read" on public.fiscal_document_integration;
create policy "fiscal_integration_admin_read" on public.fiscal_document_integration
 for select to authenticated using((select private.is_admin()));
comment on table public.fiscal_document_integration is
 'Nenhuma transmissão, chave de acesso ou protocolo autorizados nesta fase; status restrito a not_submitted.';

create or replace function private.save_fiscal_issuer(p_data jsonb)
 returns boolean language plpgsql security definer set search_path=''
as $$
declare v_cnpj text;v_ibge text;v_cep text;v_uf text;v_crt text;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administrador pode editar o emitente' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Dados inválidos';end if;
 v_cnpj:=btrim(coalesce(p_data->>'cnpj',''));
 v_ibge:=btrim(coalesce(p_data->>'city_ibge_code',''));
 v_cep:=btrim(coalesce(p_data->>'postal_code',''));
 v_uf:=upper(btrim(coalesce(p_data->>'state_code','SP')));
 v_crt:=nullif(btrim(coalesce(p_data->>'tax_regime','')),'');
 if (v_cnpj<>'' and v_cnpj !~ '^[0-9]{14}$')
  or (v_ibge<>'' and v_ibge !~ '^[0-9]{7}$')
  or (v_cep<>'' and v_cep !~ '^[0-9]{8}$')
  or v_uf !~ '^[A-Z]{2}$'
  or (v_crt is not null and v_crt not in ('1','2','3','4'))
  or length(coalesce(p_data->>'legal_name',''))>180
  or length(coalesce(p_data->>'trade_name',''))>180
  or length(coalesce(p_data->>'state_registration',''))>18
  or length(coalesce(p_data->>'city',''))>100
  or length(coalesce(p_data->>'street',''))>160
  or length(coalesce(p_data->>'house_number',''))>20
  or length(coalesce(p_data->>'district',''))>100 then
   raise exception 'Dados fiscais do emitente inconsistentes';end if;
 update public.fiscal_issuer_settings set
  legal_name=btrim(coalesce(p_data->>'legal_name','')),
  trade_name=btrim(coalesce(p_data->>'trade_name','')),
  cnpj=v_cnpj,
  state_registration=btrim(coalesce(p_data->>'state_registration','')),
  tax_regime=v_crt::smallint,state_code=v_uf,
  city=btrim(coalesce(p_data->>'city','')),
  city_ibge_code=v_ibge,postal_code=v_cep,
  street=btrim(coalesce(p_data->>'street','')),
  house_number=btrim(coalesce(p_data->>'house_number','')),
  district=btrim(coalesce(p_data->>'district','')),
  updated_at=now(),updated_by=auth.uid() where id=1;
 return found;
end;
$$;
revoke all on function private.save_fiscal_issuer(jsonb) from public,anon;
grant execute on function private.save_fiscal_issuer(jsonb) to authenticated;
create or replace function public.save_fiscal_issuer(p_data jsonb)
 returns boolean language sql security invoker set search_path=''
as $$select private.save_fiscal_issuer(p_data)$$;
revoke all on function public.save_fiscal_issuer(jsonb) from public,anon;
grant execute on function public.save_fiscal_issuer(jsonb) to authenticated;

create or replace function private.save_fiscal_product(p_product_id uuid,p_data jsonb)
 returns boolean language plpgsql security definer set search_path=''
as $$
declare v_origin text;v_row jsonb;v_key text;v_regex text;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administrador pode editar tributação' using errcode='42501';end if;
 if p_product_id is null or not exists(select 1 from public.products where id=p_product_id)
  or p_data is null or jsonb_typeof(p_data)<>'object' then
  raise exception 'Produto ou dados fiscais inválidos';end if;
 for v_key,v_regex in
  select * from (values
   ('ncm','^[0-9]{8}$'),('cest','^[0-9]{7}$'),
   ('commercial_unit','^[A-Z0-9]{1,6}$'),('cfop_sale','^[0-9]{4}$'),
   ('icms_cst','^[0-9]{2}$'),('csosn','^[0-9]{3}$'),
   ('pis_cst','^[0-9]{2}$'),('cofins_cst','^[0-9]{2}$'),
   ('cst_ibs_cbs','^[0-9]{3}$'),('class_trib_ibs_cbs','^[0-9]{6}$'))
   as q(k,r)
 loop
  if nullif(p_data->>v_key,'') is not null and p_data->>v_key !~ v_regex then
   raise exception 'Campo fiscal % inválido',v_key;end if;
 end loop;
 v_origin:=nullif(p_data->>'tax_origin','');
 if v_origin is not null and v_origin not in ('0','1','2','3','4','5','6','7','8') then
  raise exception 'Origem fiscal inválida';end if;
 insert into public.product_fiscal_details(product_id,ncm,cest,tax_origin,commercial_unit,
  cfop_sale,icms_cst,csosn,pis_cst,cofins_cst,cst_ibs_cbs,class_trib_ibs_cbs,updated_by)
 values(p_product_id,nullif(p_data->>'ncm',''),nullif(p_data->>'cest',''),
  v_origin::smallint,nullif(p_data->>'commercial_unit',''),
  nullif(p_data->>'cfop_sale',''),nullif(p_data->>'icms_cst',''),
  nullif(p_data->>'csosn',''),nullif(p_data->>'pis_cst',''),
  nullif(p_data->>'cofins_cst',''),nullif(p_data->>'cst_ibs_cbs',''),
  nullif(p_data->>'class_trib_ibs_cbs',''),auth.uid())
 on conflict(product_id) do update set
  ncm=excluded.ncm,cest=excluded.cest,tax_origin=excluded.tax_origin,
  commercial_unit=excluded.commercial_unit,cfop_sale=excluded.cfop_sale,
  icms_cst=excluded.icms_cst,csosn=excluded.csosn,pis_cst=excluded.pis_cst,
  cofins_cst=excluded.cofins_cst,cst_ibs_cbs=excluded.cst_ibs_cbs,
  class_trib_ibs_cbs=excluded.class_trib_ibs_cbs,
  updated_by=auth.uid(),updated_at=now();
 return true;
end;
$$;
revoke all on function private.save_fiscal_product(uuid,jsonb) from public,anon;
grant execute on function private.save_fiscal_product(uuid,jsonb) to authenticated;
create or replace function public.save_fiscal_product(p_product_id uuid,p_data jsonb)
 returns boolean language sql security invoker set search_path=''
as $$select private.save_fiscal_product(p_product_id,p_data)$$;
revoke all on function public.save_fiscal_product(uuid,jsonb) from public,anon;
grant execute on function public.save_fiscal_product(uuid,jsonb) to authenticated;

create or replace function private.save_fiscal_recipient(p_order_id uuid,p_data jsonb)
 returns boolean language plpgsql security definer set search_path=''
as $$
declare v_name text;v_tax text;v_ie text;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administrador pode editar destinatários' using errcode='42501';end if;
 v_name:=btrim(coalesce(p_data->>'full_name',''));
 v_tax:=nullif(btrim(coalesce(p_data->>'tax_id','')),'');
 v_ie:=nullif(btrim(coalesce(p_data->>'state_registration','')),'');
 if p_order_id is null or length(v_name) not between 2 and 160
  or (v_tax is not null and v_tax !~ '^([0-9]{11}|[0-9]{14})$')
  or length(coalesce(v_ie,''))>18
  or not exists(select 1 from public.orders where id=p_order_id and origin='admin_manual')
  then raise exception 'Destinatário fiscal inválido';end if;
 insert into public.fiscal_order_recipients(order_id,full_name,tax_id,state_registration,updated_by)
 values(p_order_id,v_name,v_tax,v_ie,auth.uid())
 on conflict(order_id) do update set full_name=excluded.full_name,tax_id=excluded.tax_id,
 state_registration=excluded.state_registration,updated_at=now(),updated_by=auth.uid();
 return true;
end;
$$;
revoke all on function private.save_fiscal_recipient(uuid,jsonb) from public,anon;
grant execute on function private.save_fiscal_recipient(uuid,jsonb) to authenticated;
create or replace function public.save_fiscal_recipient(p_order_id uuid,p_data jsonb)
 returns boolean language sql security invoker set search_path=''
as $$select private.save_fiscal_recipient(p_order_id,p_data)$$;
revoke all on function public.save_fiscal_recipient(uuid,jsonb) from public,anon;
grant execute on function public.save_fiscal_recipient(uuid,jsonb) to authenticated;
