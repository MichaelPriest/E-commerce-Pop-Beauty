import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 cartIdentity,normalizeCart,putCartItem,cartApiItems
} from '../src/lib/cart-core.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const product='22222222-2222-4222-8222-222222222222';
const red='33333333-3333-4333-8333-333333333333';
const blue='44444444-4444-4444-8444-444444444444';
const base={id:product,slug:'batom',name:'Batom',price_cents:2990,qty:1};
test('carrinho distingue duas cores do mesmo produto por variant_id',()=>{
 const one=putCartItem([], {...base,variant_id:red,variant_name:'Rosa'});
 const two=putCartItem(one,{...base,variant_id:blue,variant_name:'Azul'});
 assert.equal(two.length,2);
 assert.notEqual(cartIdentity(two[0]),cartIdentity(two[1]));
 const again=putCartItem(two,{...base,variant_id:red,qty:2});
 assert.equal(again.length,2);
 assert.equal(again[0].qty,3);
 assert.equal(again[1].qty,1);
 assert.deepEqual(cartApiItems(again),[
  {product_id:product,quantity:3,variant_id:red},
  {product_id:product,quantity:1,variant_id:blue}
 ]);
});
test('carrinho antigo de uma variação permanece legível',()=>{
 const old=normalizeCart([{...base}]);
 assert.equal(old.length,1);
 assert.equal(old[0].variant_id,undefined);
 assert.deepEqual(cartApiItems(old),[{product_id:product,quantity:1}]);
 assert.equal(cartIdentity(old[0]),product+':default');
});
test('não se aceita lixo no localStorage nem quantidade superior a 99',()=>{
 const clean=normalizeCart([null,{}, {...base,id:'fake'}, {...base,qty:0},
  {...base,variant_id:'invalid'}, {...base,qty:99},{...base,qty:5}]);
 assert.equal(clean.length,1);
 assert.equal(clean[0].qty,99);
 assert.equal(putCartItem(clean,{...base,qty:5})[0].qty,99);
});
test('galeria de produtos públicos tem limite, RLS e bloqueio de reclassificação etária',()=>{
 const first=read('supabase/public_product_gallery_v1.sql');
 const second=read('supabase/product_gallery_admin_reorder_guard_v2.sql');
 assert.match(first,/product_gallery_images/);
 assert.match(first,/enable row level security/);
 assert.match(first,/p\.active and not p\.is_adult/);
 assert.match(first,/v_count>=8/);
 assert.match(first,/products\/gallery/);
 assert.match(first,/storage_path/);
 assert.match(second,/before update of category_id,is_adult/);
 assert.match(second,/private\.is_admin\(\)/);
 assert.match(second,/select count\(distinct x\)/);
 assert.match(second,/revoke all on function public\.reorder_product_gallery/);
});
test('variações públicas não divulgam quantidades e exigem SKU ativo de produto público',()=>{
 const sql=read('supabase/catalog_variant_availability_v1.sql');
 assert.match(sql,/p\.active and not p\.is_adult and v\.active/);
 assert.match(sql,/v\.id,v\.sku,v\.name,v\.shade/);
 assert.match(sql,/l\.valid_lots/);
 assert.match(sql,/revoke all on function public\.catalog_variant_availability/);
 assert.doesNotMatch(sql,/returns table\([^)]*on_hand/s);
});
test('prévia e reserva de homologação validam variante contra o produto e impedem repetição',()=>{
 const first=read('supabase/checkout_variant_selection_v1.sql');
 const fix=read('supabase/checkout_variant_resolution_guard_v2.sql');
 assert.match(first,/v\.id=v_variant_text::uuid and v\.active/);
 assert.match(first,/v\.id=v_item\.variant_id::uuid and v\.active/);
 assert.match(first,/v_seen_variants:=array_append/);
 assert.match(fix,/v_seen_resolved:=array_append/);
 assert.match(fix,/v_variant_count>1/);
 assert.match(fix,/variant_selection_required/);
 assert.match(first,/Reserva de homologação criada/);
});
test('páginas de produto e carrinho usam galeria, SKU e limites de homologação',()=>{
 const productPage=read('src/app/produto/[slug]/page.tsx');
 const selector=read('src/components/product-details-shop.tsx');
 const cart=read('src/app/carrinho/page.tsx');
 const preview=read('src/app/checkout/preview-page.tsx');
 const api=read('src/app/api/checkout/preview/route.ts');
 const reservation=read('src/app/api/checkout/test-reservation/route.ts');
 const quote=read('src/app/api/admin/shipping/quote/route.ts');
 const images=read('src/app/admin/produtos/[id]/imagens/gallery-manager.tsx');
 assert.match(productPage,/getProductDetailExtras/);
 assert.match(selector,/pope-detail-thumbnails/);
 assert.match(selector,/variant\.available/);
 assert.match(selector,/putCartItem\(stored,item\)/);
 assert.match(cart,/cartIdentity/);
 assert.match(cart,/Trocar cor \/ variação/);
 assert.match(preview,/cartApiItems\(cartRows\)/);
 assert.match(api,/variant_id/);
 assert.match(reservation,/variant_id/);
 assert.match(quote,/selected=item\.variant_id/);
 assert.match(images,/\.upload\(storage_path,file/);
 assert.match(images,/reorder_product_gallery/);
 assert.match(images,/\.remove\(\[photo\.storage_path\]\)/);
});
