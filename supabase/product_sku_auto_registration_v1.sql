-- Campo SKU vazio no cadastro = código atômico POP. Campo manual preservado.
CREATE OR REPLACE FUNCTION public.create_product_with_variant(p_name text, p_slug text, p_category_id uuid, p_description text, p_brand text, p_price_cents integer, p_cost_cents integer, p_compare_at_cents integer, p_image_url text, p_sku text, p_variant_name text, p_shade text, p_ean text, p_safety_stock integer, p_initial_stock integer, p_lot_code text, p_expires_at date, p_active boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_product uuid; v_variant uuid; v_sku text;
begin
  if not private.is_admin() then raise exception 'Acesso restrito ao administrador' using errcode='42501'; end if;
  if p_name is null or length(btrim(p_name)) not between 2 and 150 then raise exception 'Nome inválido'; end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug)>160 then raise exception 'Slug inválido'; end if;
  if nullif(btrim(coalesce(p_sku,'')),'') is null then
    v_sku:=private.generate_product_sku();
  else
    v_sku:=btrim(p_sku);
    if length(v_sku) not between 2 and 80 then raise exception 'SKU inválido'; end if;
    if v_sku ~ '^POP-[0-9]{7,}$' then
      raise exception 'Prefixo POP numérico reservado à geração automática';
    end if;
  end if;
  if p_price_cents is null or p_price_cents<0 or p_cost_cents is null or p_cost_cents<0 or
     (p_compare_at_cents is not null and p_compare_at_cents<0) then raise exception 'Preços inválidos'; end if;
  if p_initial_stock is null or p_initial_stock<0 or p_initial_stock>100000 or
     p_safety_stock is null or p_safety_stock<0 then raise exception 'Estoque inválido'; end if;
  insert into public.products(category_id,slug,name,description,brand,price_cents,cost_cents,
    compare_at_cents,image_url,active)
  values(p_category_id,p_slug,btrim(p_name),coalesce(p_description,''),coalesce(nullif(btrim(p_brand),''),'Popê Beauty'),
    p_price_cents,p_cost_cents,p_compare_at_cents,nullif(btrim(coalesce(p_image_url,'')),''),coalesce(p_active,false))
  returning id into v_product;
  insert into public.variants(product_id,sku,name,shade,ean)
  values(v_product,v_sku,coalesce(nullif(btrim(p_variant_name),''),'Padrão'),
    nullif(btrim(coalesce(p_shade,'')),''),nullif(btrim(coalesce(p_ean,'')),'')) returning id into v_variant;
  insert into public.inventory(variant_id,safety_stock) values(v_variant,p_safety_stock);
  if p_initial_stock>0 then
    perform public.adjust_stock(v_variant,p_initial_stock,'Estoque inicial',p_lot_code,p_expires_at);
  end if;
  return v_product;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.add_product_variant(p_product_id uuid, p_sku text, p_name text, p_shade text, p_ean text, p_safety_stock integer DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_id uuid; v_sku text;
begin
 if not private.is_admin() then raise exception 'Acesso restrito' using errcode='42501'; end if;
 if nullif(btrim(coalesce(p_sku,'')),'') is null then
  v_sku:=private.generate_product_sku();
 else
  v_sku:=btrim(p_sku);
  if length(v_sku) not between 2 and 80 then raise exception 'SKU inválido'; end if;
  if v_sku ~ '^POP-[0-9]{7,}$' then
   raise exception 'Prefixo POP numérico reservado à geração automática';
  end if;
 end if;
 if p_safety_stock is null or p_safety_stock<0 then raise exception 'Estoque de segurança inválido'; end if;
 insert into public.variants(product_id,sku,name,shade,ean)
 values(p_product_id,v_sku,coalesce(nullif(btrim(p_name),''),'Padrão'),
 nullif(btrim(coalesce(p_shade,'')),''),nullif(btrim(coalesce(p_ean,'')),'')) returning id into v_id;
 insert into public.inventory(variant_id,safety_stock) values(v_id,p_safety_stock);
 return v_id;
end;
$function$
;
