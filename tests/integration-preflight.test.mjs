import test from 'node:test';
import assert from 'node:assert/strict';
import {integrationPreflight} from '../src/lib/integration-preflight.ts';
import {auditFiscalCatalog} from '../src/lib/fiscal-catalog-audit.ts';

test('credencial sandbox do Melhor Envio habilita a consulta sem configurar etiqueta comercial',()=>{
 const cards=integrationPreflight({MELHOR_ENVIO_SANDBOX_TOKEN:'sensitive-dummy-value',MELHOR_ENVIO_LABEL_ENVIRONMENT:'sandbox'});
 const sandbox=cards.find(c=>c.id==='melhor-envio-sandbox');
 const production=cards.find(c=>c.id==='melhor-envio-live');
 assert.equal(sandbox.canCheck,true);
 assert.equal(production.canCheck,false);
 assert.ok(production.missing.includes('MELHOR_ENVIO_LABEL_ENVIRONMENT'));
 assert.ok(!JSON.stringify(cards).includes('sensitive-dummy-value'));
});

test('Mercado Pago pode conferir a conta antes de habilitar preferências e webhook',()=>{
 const card=integrationPreflight({MP_LIVE_ACCESS_TOKEN:'private-token',MP_LIVE_SELLER_ID:'1234',
  MP_LIVE_WEBHOOK_ENABLED:'true'}).find(c=>c.id==='mp-live');
 assert.equal(card.canCheck,true);
 assert.ok(card.missing.includes('MP_LIVE_WEBHOOK_ENABLED'));
 assert.ok(card.missing.includes('MP_LIVE_PAYMENT_LINKS_ENABLED'));
 assert.ok(card.missing.includes('MP_LIVE_WEBHOOK_SECRET'));
});

test('o Focus exige token do ambiente selecionado',()=>{
 const environment={FOCUS_NFE_ENVIRONMENT:'homologacao',FOCUS_NFE_PRODUCAO_TOKEN:'production-token'};
 const prep=integrationPreflight(environment).find(c=>c.id==='focus');
 assert.equal(prep.canCheck,false);
 assert.deepEqual(prep.missing,['FOCUS_NFE_HOMOLOGACAO_TOKEN']);
 const configured=integrationPreflight({...environment,FOCUS_NFE_HOMOLOGACAO_TOKEN:'test-token'}).find(c=>c.id==='focus');
 assert.equal(configured.canCheck,true);
 assert.deepEqual(configured.missing,[]);
});

test('pendência de ICMS segue a escolha de CST ou CSOSN usada na NF-e',()=>{
 const product={id:'sku',name:'Batom',brand:'Popê',active:true,is_adult:false,product_fiscal_details:{icms_cst:'00'}};
 assert.ok(!auditFiscalCatalog([product],2)[0].missing.includes('CSOSN'));
 assert.ok(!auditFiscalCatalog([product],2)[0].missing.includes('CST ICMS'));
 assert.ok(auditFiscalCatalog([product],4)[0].missing.includes('CSOSN'));
});
