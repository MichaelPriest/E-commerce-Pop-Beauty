import test from 'node:test';
import assert from 'node:assert/strict';
import {focusDraft,focusPayloadIssue,focusNfeSnapshot,focusProviderPath,focusSubmissionResult} from '../src/lib/fiscal/focus-nfe-core.ts';
import {filterLabelQuotes,melhorEnvioLabelStatus,melhorEnvioPrintLink} from '../src/lib/shipping/melhor-envio-label-core.ts';

const tax={ncm:'33041000',tax_origin:0,commercial_unit:'UN',cfop_sale:'5102',csosn:'102',pis_cst:'49',cofins_cst:'49'};
const order={totalCents:3454,freightCents:994,issuer:{cnpj:'11222333000181',tax_regime:1,state_code:'SP',postal_code:'04431080'},
 recipient:{tax_id:'52998224725',full_name:'Cliente de teste'},address:{state_code:'SP',postal_code:'01000000'},nature:'Venda de mercadoria',
 items:[{sku:'B1',title:'Batom',quantity:1,priceCents:1230,tax},{sku:'B2',title:'Batom',quantity:1,priceCents:1230,tax}]};

test('rascunho fiscal rateia frete em centavos e exige meio de pagamento',()=>{
 const data=focusDraft({...order,freightCents:995,totalCents:3455});
 assert.deepEqual(data.items.map(i=>i.valor_frete),[4.98,4.97]);
 assert.match(focusPayloadIssue(data,{...order,freightCents:995,totalCents:3455}),/meios de pagamento/);
 assert.equal(data.items[0].icms_situacao_tributaria,'102');
});
test('NF-e exige endereço, itens, frete e total do pedido',()=>{
 const data=focusDraft(order);
 data.formas_pagamento[0].forma_pagamento='17';
 assert.equal(focusPayloadIssue(data,order),null);
 assert.match(focusPayloadIssue({...data,valor_total:34.55},order),/corresponder/);
 assert.match(focusPayloadIssue({...data,cep_destinatario:'99999999'},order),/corresponder/);
 assert.match(focusPayloadIssue({...data,items:[data.items[0],data.items[0]]},order),/SKU/);
 assert.match(focusPayloadIssue({...data,items:[data.items[0],{...data.items[1],valor_frete:0}]},order),/frete dos itens/);
});
test('rejeição, processamento e autorização fiscal exigem retorno do emissor',()=>{
 const base='https://api.focusnfe.com.br';
 const key='1234'.repeat(11);
 assert.equal(focusNfeSnapshot({status:'autorizado'},base),null);
 assert.equal(focusNfeSnapshot({status:'processando_autorizacao'},base).status,'processing');
 assert.equal(focusNfeSnapshot({status:'autorizado',chave_nfe:'NFe'+key},base).invoice_key,key);
 assert.equal(focusSubmissionResult(503,{},base),null);
 assert.equal(focusSubmissionResult(422,{},base).status,'rejected');
 assert.equal(focusProviderPath('/arquivos/nota.xml',base),'/arquivos/nota.xml');
 assert.equal(focusProviderPath('https://api.focusnfe.com.br.test/nota.xml',base),null);
});
test('etiquetas retomam situação a partir dos estados confirmados do Melhor Envio',()=>{
 assert.equal(melhorEnvioLabelStatus({status:'released'}),'paid');
 assert.equal(melhorEnvioLabelStatus({status:'released',generated_at:'2026-11-17'}),'generated');
 assert.equal(melhorEnvioLabelStatus({status:'suspended'}),null);
 assert.equal(melhorEnvioLabelStatus({status:'canceled',paid_at:'2026-11-17'}),'cancelled');
 assert.equal(melhorEnvioLabelStatus({status:'delivered',tracking:'ABCD123'}),'delivered');
});
test('impede usar link de impressão de outro ambiente e filtra serviço por volumes',()=>{
 const links='https://sandbox.melhorenvio.com.br/imprimir/123';
 assert.equal(melhorEnvioPrintLink(links,'sandbox'),links);
 assert.equal(melhorEnvioPrintLink(links,'producao'),null);
 assert.equal(melhorEnvioPrintLink('https://melhorenvio.com.br.example/123','producao'),null);
 const quote=(id,carrier)=>({id,name:'Padrão',company:{name:carrier},price:'9.94'});
 const quotes=[quote(1,'Correios'),quote(2,'Jadlog'),quote(3,'Azul Cargo')];
 assert.deepEqual(filterLabelQuotes(quotes,1).map(q=>q.id),[1,2]);
 assert.deepEqual(filterLabelQuotes(quotes,2).map(q=>q.id),[2]);
});
