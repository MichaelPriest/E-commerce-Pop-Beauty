-- Preservar EAN ao atualizar um produto por CSV
CREATE OR REPLACE FUNCTION public.bulk_upsert_catalog_csv(p_rows jsonb, p_validate_only boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_row jsonb;
 v_index integer:=0;
 v_count integer;
 v_action text;v_slug text;v_name text;v_sku text;
 v_category_slug text;v_category_id uuid;
 v_price integer;v_cost integer;v_ean text;v_brand text;v_description text;
 v_variant_name text;v_shade text;
 v_product_id uuid;v_variant_id uuid;
 v_existing_ean uuid;
 v_seen_slugs text[]:=array[]::text[];
 v_seen_skus text[]:=array[]::text[];
 v_seen_eans text[]:=array[]::text[];
 v_seen_products uuid[]:=array[]::uuid[];
 v_created integer:=0;v_updated integer:=0;
 v_results jsonb:='[]'::jsonb;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administradores podem importar catálogo'
   using errcode='42501';
 end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' then
  raise exception 'Envie uma lista de produtos' using errcode='22023';
 end if;
 v_count:=jsonb_array_length(p_rows);
 if v_count<1 or v_count>40 then
  raise exception 'O arquivo deve conter entre 1 e 40 linhas por lote'
   using errcode='22023';
 end if;
 for v_row in select value from jsonb_array_elements(p_rows)
 loop
  v_index:=v_index+1;
  if jsonb_typeof(v_row)<>'object' then
   raise exception 'Linha %: campos inválidos',v_index;
  end if;
  v_action:=lower(btrim(coalesce(v_row->>'action','')));
  v_slug:=lower(btrim(coalesce(v_row->>'slug','')));
  v_name:=btrim(coalesce(v_row->>'name',''));
  v_sku:=btrim(coalesce(v_row->>'sku',''));
  v_category_slug:=lower(btrim(coalesce(v_row->>'category_slug','')));
  v_brand:=btrim(coalesce(v_row->>'brand',''));
  v_description:=btrim(coalesce(v_row->>'description',''));
  v_variant_name:=btrim(coalesce(v_row->>'variant_name',''));
  v_shade:=nullif(btrim(coalesce(v_row->>'shade','')),'');
  v_ean:=nullif(btrim(coalesce(v_row->>'ean','')),'');
  if v_action not in ('create','update') then
   raise exception 'Linha %: ação deve ser criar ou atualizar',v_index;
  end if;
  if length(v_name) not between 2 and 150 or length(v_brand)>120
   or length(v_description)>5000 or length(v_variant_name)>100
   or length(coalesce(v_shade,''))>100 then
   raise exception 'Linha %: nome, marca ou descrição inválida',v_index;
  end if;
  if v_category_slug='' or v_category_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or length(v_category_slug)>160 then
   raise exception 'Linha %: categoria deve ser um slug válido',v_index;
  end if;
  select c.id into v_category_id from public.categories c
   where c.slug=v_category_slug and c.active and not c.is_adult;
  if v_category_id is null then
   raise exception 'Linha %: categoria inativa, restrita ou inexistente: %',
    v_index,v_category_slug;
  end if;
  if (v_row->>'price_cents') !~ '^[0-9]{1,9}$'
   or (v_row->>'cost_cents') !~ '^[0-9]{1,9}$' then
   raise exception 'Linha %: preços precisam ser inteiros em centavos',v_index;
  end if;
  v_price:=(v_row->>'price_cents')::integer;
  v_cost:=(v_row->>'cost_cents')::integer;
  if v_price>100000000 or v_cost>100000000 then
   raise exception 'Linha %: valor fora do limite',v_index;
  end if;
  if v_ean is not null then
   if not private.is_valid_gtin(v_ean) then
    raise exception 'Linha %: EAN/GTIN inválido',v_index;
   end if;
   if v_ean=any(v_seen_eans) then
    raise exception 'Linha %: código de barras duplicado no arquivo',v_index;
   end if;
   v_seen_eans:=array_append(v_seen_eans,v_ean);
  end if;
  if v_action='create' then
   if v_slug='' or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or length(v_slug)>160 then
    raise exception 'Linha %: endereço do produto inválido',v_index;
   end if;
   if v_slug=any(v_seen_slugs) or
    exists(select 1 from public.products where slug=v_slug) then
    raise exception 'Linha %: endereço já utilizado ou duplicado',v_index;
   end if;
   v_seen_slugs:=array_append(v_seen_slugs,v_slug);
   if v_sku<>'' then
    if length(v_sku) not between 2 and 80 or v_sku ~ '^POP-[0-9]{7,}$' then
     raise exception 'Linha %: SKU manual inválido ou prefixo POP reservado',v_index;
    end if;
    if v_sku=any(v_seen_skus) or
      exists(select 1 from public.variants where sku=v_sku) then
     raise exception 'Linha %: SKU já existente ou duplicado',v_index;
    end if;
    v_seen_skus:=array_append(v_seen_skus,v_sku);
   end if;
   if v_ean is not null and
    exists(select 1 from public.variants where ean=v_ean) then
    raise exception 'Linha %: código de barras já utilizado',v_index;
   end if;
   if not p_validate_only then
    v_product_id:=public.create_product_with_variant(
     v_name,v_slug,v_category_id,v_description,
     coalesce(nullif(v_brand,''),'Popê Beauty'),
     v_price,v_cost,null::integer,null::text,
     v_sku,coalesce(nullif(v_variant_name,''),'Padrão'),
     v_shade,v_ean,0,0,'SEM-LOTE',null::date,false
    );
   end if;
   v_created:=v_created+1;
   v_results:=v_results||jsonb_build_array(jsonb_build_object(
    'line',v_index,'action','create','slug',v_slug,
    'sku',case when v_sku='' then '(automático ao salvar)' else v_sku end
   ));
  else
   if length(v_sku) not between 2 and 80 then
    raise exception 'Linha %: SKU obrigatório para atualizar',v_index;
   end if;
   if v_sku=any(v_seen_skus) then
    raise exception 'Linha %: SKU repetido',v_index;
   end if;
   v_seen_skus:=array_append(v_seen_skus,v_sku);
   select v.id,v.product_id into v_variant_id,v_product_id
   from public.variants v where v.sku=v_sku for update;
   if v_variant_id is null then
    raise exception 'Linha %: SKU não encontrado: %',v_index,v_sku;
   end if;
   if v_product_id=any(v_seen_products) then
    raise exception 'Linha %: dois SKUs do mesmo produto; atualize apenas um por lote',
     v_index;
   end if;
   v_seen_products:=array_append(v_seen_products,v_product_id);
   perform 1 from public.products p where p.id=v_product_id
    and not p.is_adult for update;
   if not found then
    raise exception 'Linha %: atualização de produtos +18 não permitida por CSV',
     v_index;
   end if;
   if v_ean is not null and exists(
     select 1 from public.variants v where v.ean=v_ean and v.id<>v_variant_id
   ) then
    raise exception 'Linha %: código de barras pertence a outro SKU',v_index;
   end if;
   if not p_validate_only then
    update public.products set
     name=v_name,category_id=v_category_id,
     brand=coalesce(nullif(v_brand,''),'Popê Beauty'),
     description=v_description,price_cents=v_price,cost_cents=v_cost
     where id=v_product_id;
    -- EAN vazio no CSV nao apaga codigo anterior.
    update public.variants set
     ean=coalesce(v_ean,ean)
     where id=v_variant_id;
   end if;
   v_updated:=v_updated+1;
   v_results:=v_results||jsonb_build_array(jsonb_build_object(
    'line',v_index,'action','update','sku',v_sku
   ));
  end if;
 end loop;
 return jsonb_build_object('validated',true,'dry_run',p_validate_only,
  'created',v_created,'updated',v_updated,'rows',v_results);
end;
$function$
;
