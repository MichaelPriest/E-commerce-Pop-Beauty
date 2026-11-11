import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('a migração mantém reserva pública de checkout desligada por padrão',()=>{
 const migration=read('supabase/checkout_addresses_reservations.sql');
 assert.match(migration,/checkout_reservations_enabled boolean not null default false/);
 assert.match(migration,/origin='store_api'/);
});
test('o endpoint de webhook é exclusivamente TEST e não atualiza pedidos pagos',()=>{
 const route=read('src/app/api/webhooks/mercadopago/test/route.ts');
 assert.match(route,/mpTestWebhookEnabled\(\)/);
 assert.match(route,/verifyMpWebhookSignature\(/);
 assert.match(route,/fetchMercadoPagoTestPayment\(/);
 assert.doesNotMatch(route,/\.from\(['"]orders['"]\)[\s\S]*?\.update\(/);
 assert.doesNotMatch(route,/status:\s*['"]paid['"]/);
});
test('o fluxo de checkout comercial continua indisponível',()=>{
 const preview=read('src/app/checkout/preview-page.tsx');
 const mp=read('src/app/api/admin/payments/mercadopago/test-checkout/route.ts');
 assert.match(preview,/Pagamento ainda não liberado/);
 assert.match(mp,/sandboxPreferenceEnabled\(\)/);
 assert.match(mp,/verifyMercadoPagoTestSeller\(\)/);
});

test('package-lock v3 mantém as dependências declaradas no projeto',()=>{
 const manifest=JSON.parse(read('package.json'));
 const lock=JSON.parse(read('package-lock.json'));
 assert.equal(lock.lockfileVersion,3);
 assert.equal(lock.name,manifest.name);
 assert.deepEqual(lock.packages[''].dependencies,manifest.dependencies);
 assert.deepEqual(lock.packages[''].devDependencies,manifest.devDependencies);
});
test('workflow principal exige instalação reproduzível via npm ci',()=>{
 const workflow=read('.github/workflows/quality.yml');
 assert.match(workflow,/run: npm ci --no-audit --no-fund/);
 assert.doesNotMatch(workflow,/run: npm install(?:\s|$)/);
});
