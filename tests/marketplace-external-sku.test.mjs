import test from 'node:test';
import assert from 'node:assert/strict';
import {safeMercadoLivreListingSku,safeShopeeListingSku}
 from '../src/lib/marketplaces/external-sku-core.ts';

test('Mercado Livre: utiliza SELLER_SKU de anúncio sem variações',()=>{
 assert.equal(safeMercadoLivreListingSku({
  attributes:[{id:'SELLER_SKU',value_name:'POP-001'}],
  seller_custom_field:'OUTRO'
 }),'POP-001');
});
test('Mercado Livre: não confunde seller_custom_field com SELLER_SKU',()=>{
 assert.equal(safeMercadoLivreListingSku({
  seller_custom_field:'REFERENCIA-INTERNA',attributes:[]
 }),'');
});
test('Mercado Livre: não associa anúncio pai com SKUs de variações',()=>{
 assert.equal(safeMercadoLivreListingSku({
  attributes:[{id:'SELLER_SKU',value_name:'SKU-PAI'}],
  variations:[{id:123,attributes:[{id:'SELLER_SKU',value_name:'SKU-MODELO'}]}]
 }),'');
});
test('Shopee: item_sku somente para produto explicitamente sem modelo',()=>{
 assert.equal(safeShopeeListingSku({has_model:false,item_sku:'SK-UNICO'}),'SK-UNICO');
 assert.equal(safeShopeeListingSku({has_model:true,item_sku:'PAI'}),'');
 assert.equal(safeShopeeListingSku({item_sku:'SEM-INFORMACAO'}),'');
});
