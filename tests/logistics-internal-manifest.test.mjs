import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('romaneio exige autenticação administrativa e pedidos internos',()=>{
 const page=read('src/app/admin/logistica/romaneio/page.tsx');
 assert.match(page,/requireAdmin\(\)/);
 assert.match(page,/\.eq\('origin','admin_manual'\)/);
 assert.match(page,/ids\.length>30/);
 assert.match(page,/new Set\(ids\)\.size!==ids\.length/);
 assert.match(page,/data\.length!==ids\.length/);
});
test('romaneio permanece exclusivamente interno e sem mutações',()=>{
 const page=read('src/app/admin/logistica/romaneio/page.tsx');
 assert.match(page,/ROMANEIO INTERNO/);
 assert.match(page,/não altera o status do pedido/);
 assert.doesNotMatch(page,/\.update\(|\.insert\(|\.delete\(|fetch\(/);
});
test('logística permite seleção explícita e limita lote a 30',()=>{
 const page=read('src/app/admin/logistica/logistics-manager.tsx');
 assert.match(page,/selectable\.slice\(0,30\)/);
 assert.match(page,/\.slice\(0,30\)/);
 assert.match(page,/romaneio\?pedidos=/);
 assert.match(page,/batchIds\.length/);
});
