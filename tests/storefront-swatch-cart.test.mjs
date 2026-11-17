import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 cardVariantCover,selectedCardVariant,cardVariantLabel
} from '../src/lib/catalog-card-preview.ts';
import {
 safeCartImageUrl,normalizeCart,putCartItem,cartApiItems
} from '../src/lib/cart-core.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const pid='22222222-2222-4222-8222-222222222222';
const pink='33333333-3333-4333-8333-333333333333';
const purple='44444444-4444-4444-8444-444444444444';

test('foto da cor tem prioridade sobre capa, sem mostrar outra cor',()=>{
 const gallery=[
  {variant_id:null,url:'https://cdn.example/general.webp'},
  {variant_id:pink,url:'https://cdn.example/pink.webp'},
  {variant_id:purple,url:'https://cdn.example/purple.webp'}
 ];
 assert.equal(cardVariantCover(pink,'https://cdn.example/cover.webp',null,gallery),
  'https://cdn.example/pink.webp');
 assert.equal(cardVariantCover(purple,'https://cdn.example/cover.webp',null,gallery),
  'https://cdn.example/purple.webp');
 assert.equal(cardVariantCover('unknown','https://cdn.example/cover.webp',null,gallery),
  'https://cdn.example/cover.webp');
 assert.equal(cardVariantCover(null,null,null,gallery),null);
 assert.equal(cardVariantCover(null,null,'https://cdn.example/general.webp',gallery),
  'https://cdn.example/general.webp');
});
test('SKU selecionado precisa existir na lista retornada pelo banco',()=>{
 const variants=[
  {variant_id:pink,sku:'POP-0000123',name:'Cor 01',shade:'Rosa',available:true,image_url:null},
  {variant_id:purple,sku:'POP-0000124',name:'Cor 02',shade:'Violeta',available:false,image_url:null}
 ];
 assert.equal(cardVariantLabel(variants[0]),'Rosa');
 assert.equal(selectedCardVariant(variants,pink)?.available,true);
 assert.equal(selectedCardVariant(variants,purple)?.available,false);
 assert.equal(selectedCardVariant(variants,'fake'),null);
});
test('carrinho rejeita URLs e protocolos não seguros',()=>{
 assert.equal(safeCartImageUrl('javascript:alert(1)'),null);
 assert.equal(safeCartImageUrl('data:image/svg+xml,<svg/>'),null);
 assert.equal(safeCartImageUrl('//other.example/image.jpg'),null);
 assert.equal(safeCartImageUrl('http://example.com/a.png'),null);
 assert.equal(safeCartImageUrl('https://cdn.example/image.webp'),
  'https://cdn.example/image.webp');
 assert.equal(safeCartImageUrl('/images/photo.webp'),'/images/photo.webp');
});
test('mesma cor conserva quantidade e atualiza a imagem; outra cor fica em outra linha',()=>{
 const old={id:pid,slug:'batom',name:'Batom',price_cents:2990,qty:1,
  variant_id:pink,variant_name:'Rosa',sku:'POP-1',image_url:'https://cdn.example/old.webp'};
 const first=normalizeCart([old]);
 const updated=putCartItem(first,{...old,image_url:'https://cdn.example/new.webp',qty:2});
 assert.equal(updated.length,1);
 assert.equal(updated[0].qty,3);
 assert.equal(updated[0].image_url,'https://cdn.example/new.webp');
 const both=putCartItem(updated,{...old,variant_id:purple,variant_name:'Violeta',qty:1});
 assert.equal(both.length,2);
 assert.equal(cartApiItems(both)[1].variant_id,purple);
});
test('URL maliciosa no localStorage é removida antes de chegar ao carrinho',()=>{
 const items=normalizeCart([{id:pid,slug:'batom',name:'Batom',qty:1,
  price_cents:2000,variant_id:pink,image_url:'javascript:alert(1)'}]);
 assert.equal(items.length,1);
 assert.equal(items[0].image_url,undefined);
});
test('catálogo usa consultas em lote, sem uma chamada por cartão',()=>{
 const catalog=read('src/lib/catalog.ts');
 assert.match(catalog,/sb\.rpc\('catalog_variant_availability',\{p_product_ids:ids\}\)/);
 assert.match(catalog,/sb\.from\('product_gallery_images'\)/);
 assert.match(catalog,/\.in\('product_id',ids\)/);
 assert.match(catalog,/\.limit\(96\)/);
 assert.match(catalog,/preview_variants:variantsByProduct\.get\(p\.id\)\?\?\[\]/);
 assert.match(catalog,/cardVariantCover\(variant\.variant_id,cover,general,gallery\)/);
});
test('cartões só adicionam SKU selecionado e disponível',()=>{
 const component=read('src/components/product-card.tsx');
 assert.match(component,/selectedCardVariant\(variants,selectedId\)/);
 assert.match(component,/const ready=!demo&&!product\.is_adult&&!!chosen\?\.available/);
 assert.match(component,/aria-pressed=\{selected\}/);
 assert.match(component,/!variant\.available/);
 assert.match(component,/variant_id:chosen\.variant_id/);
 assert.match(component,/putCartItem\(stored,item\)/);
 assert.match(component,/disabled=\{!ready\}/);
 assert.match(component,/variacao=/);
});
test('página da cor, detalhe e carrinho preservam foto e variante',()=>{
 const page=read('src/app/produto/[slug]/page.tsx');
 const detail=read('src/components/product-details-shop.tsx');
 const cart=read('src/app/carrinho/page.tsx');
 assert.match(page,/initialVariantId=\{typeof variacao==='string'\?variacao:''\}/);
 assert.match(detail,/variants\.some\(v=>v\.variant_id===initialVariantId\)/);
 assert.match(detail,/image_url:images\[0\]\.url/);
 assert.match(cart,/pope-cart-thumbnail/);
 assert.match(cart,/item\.image_url/);
 assert.match(cart,/encodeURIComponent\(item\.variant_id\)/);
});
