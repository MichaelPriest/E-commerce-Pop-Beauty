import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildOrderSandboxQuote,parseOrderSandboxQuotes} from '../src/lib/shipping/order-sandbox-quote.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const parcels=[
 {volume_number:1,weight_g:750,height_cm:15,width_cm:22,length_cm:31,contents_note:null},
 {volume_number:2,weight_g:1250,height_cm:10.5,width_cm:20,length_cm:25,contents_note:null}
];
test('payload por volumes usa kg, cm, e somente endpoints de cálculo',()=>{
 const data=buildOrderSandboxQuote({originZip:'01001000',destinationZip:'01310930',volumes:parcels});
 assert.deepEqual(data.from,{postal_code:'01001000'});
 assert.deepEqual(data.to,{postal_code:'01310930'});
 assert.deepEqual(data.volumes,[
  {height:15,width:22,length:31,weight:0.75},
  {height:10.5,width:20,length:25,weight:1.25}
 ]);
 assert.deepEqual(data.options,{receipt:false,own_hand:false});
});
test('CEP, dimensões, peso e numeração inválidos bloqueiam a cotação',()=>{
 const valid={originZip:'01001000',destinationZip:'01310930',volumes:parcels};
 assert.throws(()=>buildOrderSandboxQuote({...valid,originZip:'123'}),/CEP/);
 assert.throws(()=>buildOrderSandboxQuote({...valid,volumes:[]}),/quantidade/);
 assert.throws(()=>buildOrderSandboxQuote({...valid,volumes:[
  {...parcels[0],weight_g:0}]}),/Peso/);
 assert.throws(()=>buildOrderSandboxQuote({...valid,volumes:[
  {...parcels[0],height_cm:0.001}]}),/dimensões/);
 assert.throws(()=>buildOrderSandboxQuote({...valid,volumes:[
  parcels[0],{...parcels[1],volume_number:1}]}),/repetida/);
});
test('resultado usa apenas serviço selecionado e preço customizado',()=>{
 const result=parseOrderSandboxQuotes([
  {id:1,name:'PAC',company:{name:'Correios'},price:'20.00',
   custom_price:'18.25',delivery_time:7,custom_delivery_time:4},
  {id:2,name:'SEDEX',company:{name:'Correios'},price:'30.00',delivery_time:2},
  {id:1,name:'PAC duplicado',company:{name:'Outra'},price:'999.00',delivery_time:1}
 ],'1');
 assert.deepEqual(result,[{service_id:'1',service:'PAC',carrier:'Correios',
  price_cents:1825,delivery_days:4}]);
});
test('resposta com erros ou preços fabricáveis não vira cotação',()=>{
 assert.deepEqual(parseOrderSandboxQuotes([
  {id:1,name:'PAC',company:{name:'Correios'},price:'0.00',delivery_time:2},
  {id:1,name:'PAC',company:{name:'Correios'},price:'15,50',delivery_time:2},
  {id:1,name:'PAC',company:{name:'Correios'},price:'15.00',delivery_time:3,error:'Indisponível'},
  {id:2,name:'SEDEX',company:{name:'Correios'},price:'19.90',delivery_time:2}
 ],'1'),[]);
 assert.throws(()=>parseOrderSandboxQuotes({},'1'),/inesperada/);
});
test('endpoint de cotação está isolado na sandbox e exige admin, intenção e CSRF',()=>{
 const route=read('src/app/api/admin/shipping/order-quote/[id]/route.ts');
 assert.match(route,/getClaims\(\)/);
 assert.match(route,/profile\?\.role!=='admin'/);
 assert.match(route,/request\.headers\.get\('origin'\)/);
 assert.match(route,/intent\.intent_key!==intentKey/);
 assert.match(route,/stage_internal_label_intent/);
 assert.match(route,/verified\.changed\|\|verified\.intent_key!==intentKey/);
 assert.match(route,/MELHOR_ENVIO_SANDBOX_TOKEN/);
 assert.match(route,/https:\/\/sandbox\.melhorenvio\.com\.br\/api\/v2\/me\/shipment\/calculate/);
 assert.doesNotMatch(route,/https:\/\/api\.melhorenvio\.com\.br/);
 assert.doesNotMatch(route,/api\/v2\/me\/cart/);
 assert.match(route,/shipment_purchased:false/);
 assert.match(route,/label_generated:false/);
 assert.match(route,/quote_saved:false/);
});
test('botão de cotação só fica disponível com rascunho, intenção e sandbox',()=>{
 const editor=read('src/app/admin/logistica/volumes/[id]/provider-editor.tsx');
 const page=read('src/app/admin/logistica/volumes/[id]/page.tsx');
 assert.match(editor,/canStage&&sandboxAvailable&&Boolean\(intent\)/);
 assert.match(editor,/Simular cotação por volumes/);
 assert.match(page,/sandboxAvailable=\{Boolean\(process\.env\.MELHOR_ENVIO_SANDBOX_TOKEN/);
});
