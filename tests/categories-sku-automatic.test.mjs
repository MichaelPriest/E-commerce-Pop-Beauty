import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 slugifyCategory,suggestedCategorySlug,sortedCategoryTree,matchingCategoryIds
} from '../src/lib/catalog-category-core.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const roots=[
 {id:'a',name:'Maquiagem',slug:'maquiagem',parent_id:null,position:2,active:true,is_adult:false},
 {id:'b',name:'Skincare',slug:'skincare',parent_id:null,position:1,active:true,is_adult:false},
 {id:'c',name:'Batons',slug:'maquiagem-batons',parent_id:'a',position:3,active:true,is_adult:false},
 {id:'d',name:'Base',slug:'maquiagem-base',parent_id:'a',position:1,active:true,is_adult:false},
 {id:'e',name:'Reservada',slug:'reservada',parent_id:null,position:90,active:true,is_adult:true},
 {id:'f',name:'Rascunho',slug:'maquiagem-rascunho',parent_id:'a',position:2,active:false,is_adult:false}
];
test('slug de categoria e subcategoria é simples e previsível',()=>{
 assert.equal(slugifyCategory('  Lábios & Batons  '),'labios-batons');
 assert.equal(suggestedCategorySlug('Batom Líquido',roots[0]),'maquiagem-batom-liquido');
 assert.equal(suggestedCategorySlug('Novidades',null),'novidades');
 assert.equal(slugifyCategory(''), '');
});
test('árvore mantém dois níveis e ordenação configurada',()=>{
 const tree=sortedCategoryTree(roots);
 assert.deepEqual(tree.map(x=>x.id),['b','a','e']);
 assert.deepEqual(tree[1].children.map(x=>x.id),['d','f','c']);
});
test('categoria raiz inclui filhos ativos; subcategoria só o próprio grupo',()=>{
 assert.deepEqual(matchingCategoryIds(roots,'maquiagem'),['a','c','d']);
 assert.deepEqual(matchingCategoryIds(roots,'Maquiagem'),['a','c','d']);
 assert.deepEqual(matchingCategoryIds(roots,'maquiagem-batons'),['c']);
 assert.deepEqual(matchingCategoryIds(roots,'maquiagem-rascunho'),[]);
 assert.deepEqual(matchingCategoryIds(roots,'reservada'),[]);
 assert.deepEqual(matchingCategoryIds(roots,'inexistente'),[]);
});
test('migração limita níveis, protege categorias adultas e proíbe arquivar com produtos ativos',()=>{
 const sql=read('supabase/categories_subcategories_hierarchy_v1.sql');
 assert.match(sql,/add column if not exists parent_id uuid references public\.categories/);
 assert.match(sql,/v_parent\.parent_id is not null/);
 assert.match(sql,/new\.is_adult is distinct from v_parent\.is_adult/);
 assert.match(sql,/v_parent\.active/);
 assert.match(sql,/public\.products where category_id=new\.id and active/);
 assert.match(sql,/public\.categories where parent_id=new\.id and active/);
 assert.match(sql,/pope_active_product_category/);
 assert.match(sql,/pope_category_hierarchy_guard/);
 assert.doesNotMatch(sql,/delete from public\.categories/);
});
test('admin tem gestão hierárquica e produtos selecionam pais e filhos',()=>{
 const admin=read('src/app/admin/categorias/category-manager.tsx');
 const page=read('src/app/admin/categorias/page.tsx');
 const productForm=read('src/app/admin/produtos/products-manager.tsx');
 const shell=read('src/components/admin-shell.tsx');
 assert.match(page,/requireAdmin\(\)/);
 assert.match(page,/parent_id,position,active,is_adult/);
 assert.match(admin,/Nova subcategoria/);
 assert.match(admin,/\.from\('categories'\)\.insert\(/);
 assert.match(admin,/\.update\(\{name,position,active:form\.active\}\)/);
 assert.match(admin,/Ative primeiro a categoria principal/);
 assert.match(admin,/root\.children\.length/);
 assert.match(productForm,/<optgroup key=\{parent\.id\}/);
 assert.match(productForm,/c\.parent_id===parent\.id/);
 assert.match(shell,/href:'\/admin\/categorias'/);
});
test('vitrine usa categorias ativas reais, vínculos e subcategorias',()=>{
 const homepage=read('src/app/page.tsx');
 const catalog=read('src/lib/catalog.ts');
 assert.match(homepage,/getCatalogCategories\(\)/);
 assert.match(homepage,/sortedCategoryTree\(categoryRows\)/);
 assert.match(homepage,/pope-subcategory-nav/);
 assert.match(homepage,/encodeURIComponent\(child\.slug\)/);
 assert.match(catalog,/\.eq\('is_adult',false\)/);
 assert.match(catalog,/matchingCategoryIds\(catalogCategories,category\)/);
 assert.match(catalog,/\.in\('category_id',categoryIds\)/);
});
test('SKU automático é sequencial no banco e preserva entrada manual',()=>{
 const sql=read('supabase/product_sku_generator_sequence_v1.sql');
 const registration=read('supabase/product_sku_auto_registration_v1.sql');
 assert.match(sql,/create sequence if not exists private\.product_sku_counter/);
 assert.match(sql,/pg_catalog\.nextval\('private\.product_sku_counter'/);
 assert.match(sql,/v_sku:='POP-'/);
 assert.match(sql,/from public\.variants where sku=v_sku/);
 assert.match(sql,/private\.is_admin\(\)/);
 assert.match(sql,/revoke all on sequence private\.product_sku_counter/);
 assert.match(registration,/private\.generate_product_sku\(\)/);
 assert.match(registration,/v_sku:=btrim\(p_sku\)/);
 assert.match(registration,/values\(v_product,v_sku/);
 assert.match(registration,/values\(p_product_id,v_sku/);
 assert.match(registration,/Prefixo POP numérico reservado/);
 const form=read('src/app/admin/produtos/products-manager.tsx');
 assert.match(form,/SKU \(opcional\)/);
 assert.match(form,/p_sku:form\.sku\.trim\(\)/);
 assert.match(form,/p_sku:vSku\.trim\(\)/);
 assert.match(form,/SKU automático:/);
 assert.doesNotMatch(form,/if\(form\.sku\.trim\(\)\.length<2\)/);
});
