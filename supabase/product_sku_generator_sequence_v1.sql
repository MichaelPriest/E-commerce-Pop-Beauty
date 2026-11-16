-- SKU automático POP-0000001, POP-0000002 ... Sem alterar registros existentes.
create sequence if not exists private.product_sku_counter
 as bigint increment by 1 minvalue 1 start with 1 cache 1;
revoke all on sequence private.product_sku_counter from public,anon,authenticated;

do $$
declare v_max bigint; v_last bigint; v_called boolean;
begin
 select coalesce(max(substring(sku from '^POP-([0-9]{7,15})$')::bigint),0)
  into v_max from public.variants where sku ~ '^POP-[0-9]{7,15}$';
 select last_value,is_called into v_last,v_called from private.product_sku_counter;
 if v_max>v_last then
  perform pg_catalog.setval('private.product_sku_counter'::regclass,v_max,true);
 end if;
end;
$$;

create or replace function private.generate_product_sku()
returns text language plpgsql security definer set search_path=''
as $$
declare v_counter bigint; v_sku text; v_tries integer:=0;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Geração de SKU restrita à administração' using errcode='42501';
 end if;
 loop
  v_counter:=pg_catalog.nextval('private.product_sku_counter'::regclass);
  v_sku:='POP-'||pg_catalog.lpad(v_counter::text,
   greatest(length(v_counter::text),7),'0');
  if not exists(select 1 from public.variants where sku=v_sku) then
   return v_sku;
  end if;
  v_tries:=v_tries+1;
  if v_tries>1000 then
   raise exception 'Sequência de SKU conflita com códigos existentes';
  end if;
 end loop;
end;
$$;
revoke all on function private.generate_product_sku() from public,anon,authenticated;
grant execute on function private.generate_product_sku() to authenticated;
comment on function private.generate_product_sku() is
 'Gerador POP sequencial atômico, acessível somente à administração; não cadastra produtos isoladamente.';
