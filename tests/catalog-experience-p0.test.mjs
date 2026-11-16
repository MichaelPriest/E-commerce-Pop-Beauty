import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 CATALOG_PAGE_SIZE,normalizeCatalogSearch,normalizeCatalogCategory,
 normalizeCatalogPage,catalogPageHref
} from '../src/lib/catalog-query-core.ts';
import {catalogIssues,brazilTodayISO} from '../src/lib/catalog-quality.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const valid={image_url:'https://images.example.org/p.png',
 description:'Uma descrição informativa, com benefícios, características e modo de uso recomendado.',
 price_cents:2990,
 variants:[{active:true,sku:'SKU-1',
  inventory:{on_hand:5,reserved:1,safety_stock:0},
  inventory_lots:[{on_hand:5,expires_at:null}]}]
};
test('busca escapa sintaxe PostgREST e normaliza pagina',()=>{
 assert.equal(normalizeCatalogSearch('   Batom (rosa), Base%  '),'Batom rosa Base');
 assert.equal(normalizeCatalogSearch('a'.repeat(100)).length,60);
 assert.equal(normalizeCatalogCategory('Make; --'),'Make --');
 assert.equal(normalizeCatalogPage('-1'),1);
 assert.equal(normalizeCatalogPage('1'),1);
 assert.equal(normalizeCatalogPage('12'),12);
 assert.equal(normalizeCatalogPage('10001'),1);
 assert.equal(CATALOG_PAGE_SIZE,12);
 const href=catalogPageHref({q:'Batom rosa',category:'Make',page:3});
 assert.match(href,/pagina=3/);
 assert.match(href,/categoria=Make/);
 assert.match(href,/q=Batom\+rosa/);
});
test('produto incompleto indica foto, descrição, preço, SKU e falta de saldo',()=>{
 const today='2026-11-16';
 assert.deepEqual(catalogIssues(valid,today),[]);
 const incomplete={...valid,image_url:null,description:'Curta',price_cents:0,
  variants:[{active:true,sku:'',inventory:{on_hand:0,reserved:0,safety_stock:0},
    inventory_lots:[]}]};
 assert.deepEqual(catalogIssues(incomplete,today),
  ['photo','description','price','sku','stock']);
});
test('lotes vencidos ou integralmente reservados bloqueiam disponibilidade',()=>{
 const today='2026-11-16';
 assert.ok(catalogIssues({...valid,variants:[{...valid.variants[0],
  inventory_lots:[{on_hand:5,expires_at:'2026-11-15'}]}]},today).includes('stock'));
 assert.ok(catalogIssues({...valid,variants:[{...valid.variants[0],
  inventory:{on_hand:5,reserved:5,safety_stock:0}}]},today).includes('stock'));
 assert.ok(!catalogIssues({...valid,variants:[{...valid.variants[0],
  inventory_lots:[{on_hand:5,expires_at:'2026-11-16'}]}]},today).includes('stock'));
 assert.match(brazilTodayISO(new Date('2026-11-16T15:00:00.000Z')),/^2026-11-16$/);
});
test('consulta filtra e pagina no banco, detalhe não depende dos primeiros 24 itens',()=>{
 const catalog=read('src/lib/catalog.ts');
 const homepage=read('src/app/page.tsx');
 const detail=read('src/app/produto/[slug]/page.tsx');
 assert.match(catalog,/\.range\(offset,offset\+CATALOG_PAGE_SIZE-1\)/);
 assert.match(catalog,/\.or\('name\.ilike\.'/);
 assert.match(catalog,/matchingCategoryIds\(catalogCategories,category\)/);
 assert.match(catalog,/\.in\('category_id',categoryIds\)/);
 assert.match(catalog,/catalog_product_availability/);
 assert.match(catalog,/getProductBySlug/);
 assert.match(detail,/getProductBySlug\(slug\)/);
 assert.match(homepage,/pope-catalog-pagination/);
 assert.match(homepage,/pope-catalog-search/);
});
test('RPC revela apenas status de produtos públicos e respeita lotes',()=>{
 const sql=read('supabase/catalog_public_availability_safe_v1.sql');
 assert.match(sql,/p\.active and not p\.is_adult/);
 assert.match(sql,/array_length\(p_product_ids,1\),0\) not between 1 and 24/);
 assert.match(sql,/v_stock\.reserved|i\.reserved/);
 assert.match(sql,/l\.expires_at>=v_today/);
 assert.match(sql,/grant execute on function public\.catalog_product_availability\(uuid\[\]\) to anon,authenticated/);
 assert.match(sql,/security definer set search_path=''/);
 assert.match(sql,/returns table\(product_id uuid,active_variant_count integer,can_add_to_cart boolean,status text\)/);
 assert.doesNotMatch(sql,/returns table\([^\n]*on_hand/i);
});
test('vitrine impede inserir produto esgotado no carrinho',()=>{
 const card=read('src/components/product-card.tsx');
 assert.match(card,/const ready=!demo&&!product\.is_adult&&product\.availability==='ready'/);
 assert.match(card,/if\(!ready\)return/);
 assert.match(card,/disabled=\{!ready\}/);
 assert.match(card,/Produto de demonstração/);
 assert.match(card,/Esgotado/);
 assert.match(card,/pope-favorites/);
});
test('dashboard e cadastro oferecem acesso às pendências',()=>{
 const dash=read('src/app/admin/page.tsx');
 const admin=read('src/app/admin/produtos/products-manager.tsx');
 assert.match(dash,/O que precisa de atenção agora/);
 assert.match(dash,/catalogIssues\(p,today\)/);
 assert.match(dash,/admin\/produtos\?filtro=pendencias/);
 assert.match(admin,/Com pendências na vitrine/);
 assert.match(admin,/pope-product-issues/);
 assert.match(admin,/Cadastro orientado/);
 assert.match(admin,/setFormStep\(1\)/);
 assert.match(admin,/formStep===1/);
 assert.match(admin,/formStep===2/);
 assert.match(admin,/formStep===3/);
 assert.match(admin,/advanceProductForm/);
 assert.match(admin,/Próxima etapa/);
 assert.match(admin,/Salvar alterações/);
});
