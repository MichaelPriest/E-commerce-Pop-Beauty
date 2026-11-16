import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {visibleProductGallery} from '../src/lib/product-gallery-core.ts';
const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const red='33333333-3333-4333-8333-333333333333';
const blue='44444444-4444-4444-8444-444444444444';
const photos=[
 {id:'g',url:'https://image.example/general.jpg',alt:'Embalagem',variant_id:null},
 {id:'r1',url:'https://image.example/red.jpg',alt:'Rosa',variant_id:red},
 {id:'r2',url:'https://image.example/red2.jpg',alt:'Detalhe rosa',variant_id:red},
 {id:'b',url:'https://image.example/blue.jpg',alt:'Azul',variant_id:blue}
];
test('sem cor selecionada, exibir apenas capa e imagens gerais, não fotos de outras cores',()=>{
 const shown=visibleProductGallery('https://image.example/cover.jpg','Batom',photos,null);
 assert.deepEqual(shown.map(x=>x.id),['cover','g']);
 assert.ok(shown.every(x=>x.source!=='variant'));
});
test('ao selecionar rosa, priorizar fotos rosa e manter imagens gerais; azul não aparece',()=>{
 const shown=visibleProductGallery('https://image.example/cover.jpg','Batom',photos,red);
 assert.deepEqual(shown.map(x=>x.id),['r1','r2','cover','g']);
 assert.equal(shown[0].source,'variant');
 assert.equal(shown[0].alt,'Rosa');
});
test('ao selecionar azul, não reutilizar fotos rosa; exibir seu próprio detalhe',()=>{
 const shown=visibleProductGallery('https://image.example/cover.jpg','Batom',photos,blue);
 assert.deepEqual(shown.map(x=>x.id),['b','cover','g']);
});
test('variante sem foto recorre à capa, sem inventar associação',()=>{
 const shown=visibleProductGallery('https://image.example/cover.jpg','Batom',photos,'unknown');
 assert.deepEqual(shown.map(x=>x.id),['cover','g']);
});
test('sem capa e sem fotos gerais, variante mostra somente fotos pertencentes a ela',()=>{
 const shown=visibleProductGallery(null,'Batom',photos,red);
 assert.deepEqual(shown.map(x=>x.id),['r1','r2','g']);
 assert.equal(visibleProductGallery(null,'Batom',photos.filter(x=>x.variant_id),null).length,0);
});
test('deduplicar URL para impedir miniaturas duplicadas entre capa e galeria',()=>{
 const dup=[{id:'same',url:'https://image.example/cover.jpg',alt:'Repetida',variant_id:red}];
 const shown=visibleProductGallery('https://image.example/cover.jpg','Batom',dup,red);
 assert.deepEqual(shown.map(x=>x.id),['same']);
});
test('migração exige variante pertencente ao mesmo produto, sem quebrar fotos antigas',()=>{
 const sql=load('supabase/product_gallery_variant_binding_v1.sql');
 assert.match(sql,/add column if not exists variant_id uuid/);
 assert.match(sql,/foreign key\(variant_id,product_id\)/);
 assert.match(sql,/references public\.variants\(id,product_id\)/);
 assert.match(sql,/on update restrict on delete set null \(variant_id\)/);
 assert.match(sql,/create index if not exists product_gallery_images_variant_idx/);
 assert.doesNotMatch(sql,/update public\.product_gallery_images set/);
});
test('UI administrativa pode escolher variação no upload e retag de foto existente',()=>{
 const page=load('src/app/admin/produtos/[id]/imagens/page.tsx');
 const manager=load('src/app/admin/produtos/[id]/imagens/gallery-manager.tsx');
 const products=load('src/app/admin/produtos/products-manager.tsx');
 assert.match(page,/requireAdmin\(\)/);
 assert.match(page,/select\('id,storage_path,alt_text,sort_order,created_at,variant_id'\)/);
 assert.match(page,/initialVariantId=\{initialVariantId\}/);
 assert.match(manager,/variant_id:uploadVariantId\|\|null/);
 assert.match(manager,/variant_id:selected\|\|null/);
 assert.match(manager,/Todas as cores \(foto geral\)/);
 assert.match(manager,/Foto vinculada a/);
 assert.match(products,/imagens\?sku=/);
});
test('vitrine filtra fotos por SKU e reinicia seleção de imagem quando a cor muda',()=>{
 const page=load('src/components/product-details-shop.tsx');
 const query=load('src/lib/catalog.ts');
 assert.match(page,/visibleProductGallery\(cover,product\.name,gallery,variantId\|\|null\)/);
 assert.match(page,/setVariantId\(event\.target\.value\);setImageIndex\(0\)/);
 assert.match(page,/pope-variant-photo-label/);
 assert.match(query,/select\('id,storage_path,alt_text,variant_id'\)/);
 assert.match(query,/variant_id:img\.variant_id\?\?null/);
});
