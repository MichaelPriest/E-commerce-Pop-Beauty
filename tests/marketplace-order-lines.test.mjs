import test from 'node:test';
import assert from 'node:assert/strict';
import {
 normalizeMercadoLivreOrderLines,normalizeShopeeOrderLines
} from '../src/lib/marketplaces/order-line-core.ts';

test('Mercado Livre: importa apenas atributos comerciais do pedido e SKU da variante',()=>{
 const orders=[{id:9981,status:'paid',seller:{id:123},
  buyer:{email:'private@example.com',phone:{number:'000'}},
  order_items:[{quantity:2,unit_price:12.5,
   item:{id:'MLB123',variation_id:987,seller_sku:'BEAUTY-BRONZE',
    title:'Batom bronze',seller_custom_field:'NOT-SKU'}}]}];
 const result=normalizeMercadoLivreOrderLines(orders,'123');
 assert.deepEqual(result,[{order_id:'9981',lines:[{
  line_key:'000',external_listing_id:'MLB123',external_variation_id:'987',
  sku:'BEAUTY-BRONZE',title:'Batom bronze',quantity:2,unit_price_cents:1250
 }]}]);
 assert.equal(JSON.stringify(result).includes('private@example.com'),false);
});
test('Mercado Livre: rejeita item sem detalhe, conta diferente ou pedido duplicado',()=>{
 const o={id:9981,order_items:[],seller:{id:1}};
 assert.throws(()=>normalizeMercadoLivreOrderLines([{id:1}]));
 assert.throws(()=>normalizeMercadoLivreOrderLines([o],'2'));
 assert.throws(()=>normalizeMercadoLivreOrderLines([o,o]));
});
test('Shopee: usa model_sku do modelo comprado, não o SKU pai',()=>{
 const data={response:{order_list:[{order_sn:'SO100',recipient_address:{name:'Pessoa'},
  item_list:[{item_id:999,model_id:888,model_sku:'MODELO-LILAS',
   item_sku:'PAI',item_name:'Gloss lilás',model_quantity_purchased:3,
   model_discounted_price:7.49}]}]}};
 const result=normalizeShopeeOrderLines(data,['SO100']);
 assert.deepEqual(result,[{order_id:'SO100',lines:[{
  line_key:'000',external_listing_id:'999',external_variation_id:'888',
  sku:'MODELO-LILAS',title:'Gloss lilás',quantity:3,unit_price_cents:749
 }]}]);
 assert.equal(JSON.stringify(result).includes('Pessoa'),false);
});
test('Shopee: não substitui model_sku ausente pelo item_sku do pai',()=>{
 const row={order_sn:'ABC',item_list:[{item_id:10,model_id:25,item_sku:'PAI',
   model_quantity_purchased:1}]};
 const group=normalizeShopeeOrderLines({response:{order_list:[row]}},['ABC']);
 assert.equal(group[0].lines[0].sku,'');
});
test('Shopee: produto sem variação utiliza item_sku',()=>{
 const row={order_sn:'ABC',item_list:[{item_id:10,model_id:0,
  item_sku:'SKU-UNICO',model_quantity_purchased:1,model_discounted_price:15}]};
 const group=normalizeShopeeOrderLines({response:{order_list:[row]}},['ABC']);
 assert.equal(group[0].lines[0].sku,'SKU-UNICO');
 assert.equal(group[0].lines[0].external_variation_id,'');
});
test('Shopee: falha se fornecedor omitir itens de qualquer pedido',()=>{
 const response={response:{order_list:[{order_sn:'ABC',item_list:[]}]}};
 assert.throws(()=>normalizeShopeeOrderLines(response,['ABC','XYZ']));
 assert.throws(()=>normalizeShopeeOrderLines({response:{order_list:[{order_sn:'ABC'}]}},['ABC']));
});
test('Linhas inválidas não são marcadas como quantidade ou valor confirmados',()=>{
 const row={order_sn:'ABC',item_list:[{model_id:9,model_sku:'SKU',
  model_quantity_purchased:'abc',model_discounted_price:'5.999'}]};
 const res=normalizeShopeeOrderLines({response:{order_list:[row]}},['ABC']);
 assert.equal(res[0].lines[0].quantity,null);
 assert.equal(res[0].lines[0].unit_price_cents,null);
});
