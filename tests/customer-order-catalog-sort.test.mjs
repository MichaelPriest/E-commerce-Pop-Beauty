import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 normalizeCatalogSort,catalogPageHref
} from '../src/lib/catalog-query-core.ts';
import {
 customerOrderProgress,customerDeliveryAddress,customerDeliveryMethod
} from '../src/lib/customer-order-summary.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('ordenação é normalizada, limitada e mantida na paginação',()=>{
 for(const value of ['recentes','menor-preco','maior-preco','nome']){
  assert.equal(normalizeCatalogSort(value),value);
 }
 for(const value of [undefined,null,'name','price_cents','menor-preco,products(*)',{}]){
  assert.equal(normalizeCatalogSort(value),'recentes');
 }
 const url=catalogPageHref({q:'Batom rosa',category:'make',page:2,sort:'menor-preco'});
 const params=new URL(url,'https://pope.example').searchParams;
 assert.equal(params.get('ordem'),'menor-preco');
 assert.equal(params.get('q'),'Batom rosa');
 assert.equal(params.get('categoria'),'make');
 assert.equal(params.get('pagina'),'2');
 assert.equal(new URL(catalogPageHref({q:'',category:'',page:1,sort:'recentes'}),'https://pope.example').searchParams.has('ordem'),false);
});

test('vitrine aplica ordenação no banco e conserva filtros na navegação',()=>{
 const catalog=read('src/lib/catalog.ts');
 const home=read('src/app/page.tsx');
 assert.match(catalog,/normalizeCatalogSort\(filters.sort\)/);
 assert.match(catalog,/ordered\.order\('id'/);
 assert.match(catalog,/ordered\.order\('price_cents'/);
 assert.match(catalog,/ordered\.order\('name'/);
 assert.match(home,/name="ordem"/);
 assert.match(home,/sort:filters.ordem/);
 assert.match(home,/catalogPageHref\(\{q,category:cat,page:n,sort\}\)/);
});

test('etapas do pedido refletem apenas status confirmados',()=>{
 const paid=customerOrderProgress('paid');
 assert.deepEqual(paid.map(x=>x.state),['done','current','next','next','next']);
 assert.deepEqual(customerOrderProgress('delivered').map(x=>x.state),
  ['done','done','done','done','current']);
 assert.deepEqual(customerOrderProgress('cancelled'),[]);
 assert.deepEqual(customerOrderProgress('refunded'),[]);
});

test('endereços e entrega lidam com dados opcionais ou incorretos',()=>{
 assert.deepEqual(customerDeliveryAddress(null),[]);
 assert.deepEqual(customerDeliveryAddress('texto'),[]);
 assert.deepEqual(customerDeliveryAddress({recipient:'Ana',street:'Rua Popê',
  house_number:'10',city:'São Paulo',state_code:'SP',postal_code:'04431080'}),[
  'Ana','Rua Popê, 10','São Paulo · SP','CEP 04431080'
 ]);
 assert.equal(customerDeliveryMethod({name:'Entrega padrão'}),'Entrega padrão');
 assert.equal(customerDeliveryMethod({name:{}}),'');
});

test('pedido detalhado exige titularidade e lê itens sob RLS sem privilégios de serviço',()=>{
 const page=read('src/app/conta/pedidos/[id]/page.tsx');
 const list=read('src/app/conta/page.tsx');
 const schema=read('supabase/schema.sql');
 assert.match(page,/getStorefrontCustomer\(\)/);
 assert.match(page,/\.eq\('id',id\)\.eq\('customer_id',customer.id\)/);
 assert.match(page,/\.from\('order_items'\)/);
 assert.match(page,/\.eq\('order_id',o.id\)/);
 assert.doesNotMatch(page,/service_role|createAdminClient|SUPABASE_SERVICE_ROLE/);
 assert.match(schema,/orders_own_or_staff_read/);
 assert.match(schema,/order_items_own_or_staff_read/);
 assert.match(list,/Ver detalhes e acompanhar pedido/);
 assert.match(list,/conta\/pedidos/);
});
