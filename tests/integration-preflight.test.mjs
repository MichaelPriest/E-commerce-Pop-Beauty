import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {integrationPreflight} from '../src/lib/integration-preflight.ts';
import {auditFiscalCatalog} from '../src/lib/fiscal-catalog-audit.ts';
import {PAYMENT_GATEWAYS} from '../src/lib/payment-gateways.ts';

const smtp = {
 SMTP_HOST: 'smtp.example.test', SMTP_PORT: '587',
 SMTP_USER: 'test-user', SMTP_PASSWORD: 'fixture-password',
};
const smtpCard = env => integrationPreflight(env).find(card => card.id === 'smtp');

test('diagnóstico SMTP aceita autenticar antes do cadastro do remetente', () => {
 const card = smtpCard(smtp);
 assert.equal(card.canCheck, true);
 assert.deepEqual(card.missing, ['SMTP_FROM_EMAIL']);
 assert.ok(!JSON.stringify(card).includes(smtp.SMTP_PASSWORD));
 assert.deepEqual(smtpCard({...smtp, SMTP_FROM_EMAIL:'orders@example.test'}).missing, []);
 assert.deepEqual(smtpCard({...smtp, SMTP_FROM_EMAIL:'inválido'}).missing, ['SMTP_FROM_EMAIL']);
 for (const key of Object.keys(smtp)) {
  const pending = smtpCard({...smtp, [key]:'  '});
  assert.equal(pending.canCheck, false);
  assert.ok(pending.missing.includes(key));
 }
});

test('diagnóstico SMTP identifica porta incorreta antes de conectar ao servidor', () => {
 for (const port of ['0', '65536', '-25', 'tls', '587.5']) {
  const card = smtpCard({...smtp, SMTP_PORT:port});
  assert.equal(card.canCheck, false);
  assert.ok(card.missing.includes('SMTP_PORT'));
 }
 for (const port of ['465', '587', '2525']) {
  assert.equal(smtpCard({...smtp, SMTP_PORT:port}).canCheck, true);
 }
});

test('manual e exemplo cobrem os campos da loja e de cada gateway de avaliação', () => {
 const example = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
 const manual = readFileSync(new URL('../docs/manual-de-credenciais.md', import.meta.url), 'utf8');
 const names = new Set(Array.from(example.matchAll(/^(?:# *)?([A-Z][A-Z0-9_]+)=/gm), match => match[1]));
 for (const gateway of PAYMENT_GATEWAYS) {
  for (const key of gateway.envKeys) assert.ok(names.has(key), 'Falta no .env.example: '+key);
 }
 for (const name of names) assert.ok(manual.includes('`'+name+'`'), 'Falta no manual: '+name);
});

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
