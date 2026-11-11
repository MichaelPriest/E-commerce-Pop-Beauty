import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fiscalAmountReconciliation} from '../src/lib/fiscal/readiness-core.ts';

test('valores exatos em centavos não apresentam divergência',()=>{
 const result=fiscalAmountReconciliation([{quantity:2,priceCents:1099},{quantity:1,priceCents:802}],3000);
 assert.equal(result.items_total_cents,3000);
 assert.equal(result.difference_cents,0);
 assert.deepEqual(result.issues,[]);
});
test('frete ou descontos não discriminados exigem conferência',()=>{
 const result=fiscalAmountReconciliation([{quantity:2,priceCents:1000}],2300);
 assert.equal(result.difference_cents,300);
 assert.match(result.issues.join(' '),/discriminar frete, desconto ou ajuste/);
});
test('quantidades e totais inválidos são sinalizados',()=>{
 const result=fiscalAmountReconciliation([{quantity:0,priceCents:100}],-5);
 assert.equal(result.issues.length,2);
});
test('overflow aritmético não passa despercebido',()=>{
 const result=fiscalAmountReconciliation([{quantity:2,priceCents:Number.MAX_SAFE_INTEGER}],10);
 assert.match(result.issues.join(' '),/intervalo seguro/);
});
test('exportação mantém total e diferença sem declarar emissão',()=>{
 const route=readFileSync(new URL('../src/app/api/admin/fiscal/export/[id]/route.ts',import.meta.url),'utf8');
 assert.match(route,/fiscalAmountReconciliation\(prepared,o\.data\.total_cents\)/);
 assert.match(route,/amount_reconciliation:/);
 assert.match(route,/ready_for_transmission:false/);
});