-- Dados mínimos de logística. Não cria etiquetas, fretes comerciais nem pagamentos.
create table if not exists public.shipping_origin_settings (
 id smallint primary key default 1 check(id=1),
 origin_postal_code char(8),
 preferred_sandbox_provider text not null default 'melhor_envio'
  check(preferred_sandbox_provider='melhor_envio'),
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 constraint shipping_origin_zip_valid check(origin_postal_code is null or origin_postal_code ~ '^[0-9]{8}$')
);
insert into public.shipping_origin_settings(id) values(1) on conflict(id) do nothing;
alter table public.shipping_origin_settings enable row level security;
drop policy if exists "shipping_origin_admin_select" on public.shipping_origin_settings;
create policy "shipping_origin_admin_select" on public.shipping_origin_settings
 for select to authenticated using ((select private.is_admin()));
revoke all on public.shipping_origin_settings from public,anon,authenticated;
grant select on public.shipping_origin_settings to authenticated;

create table if not exists public.variant_shipping_specs (
 variant_id uuid primary key references public.variants(id) on delete cascade,
 weight_g integer not null check(weight_g between 1 and 30000),
 height_cm integer not null check(height_cm between 1 and 200),
 width_cm integer not null check(width_cm between 1 and 200),
 length_cm integer not null check(length_cm between 1 and 200),
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now()
);
create index if not exists idx_variant_shipping_specs_updated_by
 on public.variant_shipping_specs(updated_by) where updated_by is not null;
create index if not exists idx_shipping_origin_settings_updated_by
 on public.shipping_origin_settings(updated_by) where updated_by is not null;
alter table public.variant_shipping_specs enable row level security;
drop policy if exists "variant_shipping_specs_admin_select" on public.variant_shipping_specs;
create policy "variant_shipping_specs_admin_select" on public.variant_shipping_specs
 for select to authenticated using ((select private.is_admin()));
revoke all on public.variant_shipping_specs from public,anon,authenticated;
grant select on public.variant_shipping_specs to authenticated;

create or replace function private.save_shipping_origin(p_zip text)
 returns boolean language plpgsql security definer set search_path=''
as $$
declare v_zip text;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Acesso administrativo obrigatório' using errcode='42501';
 end if;
 v_zip:=regexp_replace(coalesce(p_zip,''),'[^0-9]','','g');
 if v_zip !~ '^[0-9]{8}$' then
  raise exception 'CEP de origem deve possuir 8 números';
 end if;
 insert into public.shipping_origin_settings(id,origin_postal_code,updated_by,updated_at)
 values(1,v_zip,auth.uid(),now())
 on conflict(id) do update set
  origin_postal_code=excluded.origin_postal_code,
  updated_by=excluded.updated_by,
  updated_at=now();
 return true;
end;
$$;
revoke all on function private.save_shipping_origin(text) from public,anon;
grant execute on function private.save_shipping_origin(text) to authenticated;
create or replace function public.save_shipping_origin(p_zip text)
 returns boolean language sql security invoker set search_path=''
as $$select private.save_shipping_origin(p_zip)$$;
revoke all on function public.save_shipping_origin(text) from public,anon;
grant execute on function public.save_shipping_origin(text) to authenticated;

create or replace function private.save_variant_shipping_specs(
 p_variant_id uuid,p_weight_g integer,p_height_cm integer,p_width_cm integer,p_length_cm integer
) returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Acesso administrativo obrigatório' using errcode='42501';
 end if;
 if p_variant_id is null or not exists(select 1 from public.variants where id=p_variant_id) then
  raise exception 'Variação não encontrada';
 end if;
 if p_weight_g not between 1 and 30000 or
    p_height_cm not between 1 and 200 or
    p_width_cm not between 1 and 200 or
    p_length_cm not between 1 and 200 then
  raise exception 'Peso ou dimensões inválidos';
 end if;
 insert into public.variant_shipping_specs(
  variant_id,weight_g,height_cm,width_cm,length_cm,updated_by
 ) values(p_variant_id,p_weight_g,p_height_cm,p_width_cm,p_length_cm,auth.uid())
 on conflict(variant_id) do update set
  weight_g=excluded.weight_g,height_cm=excluded.height_cm,
  width_cm=excluded.width_cm,length_cm=excluded.length_cm,
  updated_by=auth.uid(),updated_at=now();
 return true;
end;
$$;
revoke all on function private.save_variant_shipping_specs(uuid,integer,integer,integer,integer)
 from public,anon;
grant execute on function private.save_variant_shipping_specs(uuid,integer,integer,integer,integer)
 to authenticated;
create or replace function public.save_variant_shipping_specs(
 p_variant_id uuid,p_weight_g integer,p_height_cm integer,p_width_cm integer,p_length_cm integer
) returns boolean language sql security invoker set search_path=''
as $$
 select private.save_variant_shipping_specs(
  p_variant_id,p_weight_g,p_height_cm,p_width_cm,p_length_cm)
$$;
revoke all on function public.save_variant_shipping_specs(uuid,integer,integer,integer,integer)
 from public,anon;
grant execute on function public.save_variant_shipping_specs(uuid,integer,integer,integer,integer)
 to authenticated;

comment on table public.variant_shipping_specs is 'Dimensões físicas por SKU para futuras cotações; acesso administrativo.';
comment on table public.shipping_origin_settings is 'CEP de origem para testes de cotação; sem habilitação de transportadoras comerciais.';
