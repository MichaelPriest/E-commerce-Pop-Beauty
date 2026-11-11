import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('exportação fiscal é autenticada e limitada aos pedidos internos',()=>{
 const route=read('src/app/api/admin/fiscal/export/[id]/route.ts');
 assert.match(route,/getClaims\(\)/);
 assert.match(route,/profile\?\.role!=='admin'/);
 assert.match(route,/\.eq\('origin','admin_manual'\)/);
 assert.match(route,/is_official_document:false/);
 assert.match(route,/ready_for_transmission:false/);
 assert.match(route,/document_status:'not_submitted'/);
});
test('não existe chamada externa à SEFAZ no export de preparação fiscal',()=>{
 const route=read('src/app/api/admin/fiscal/export/[id]/route.ts');
 assert.doesNotMatch(route,/\bfetch\(/);
 assert.doesNotMatch(route,/\.from\(['"]orders['"]\)\s*\.update\(/);
 assert.match(route,/private, no-store/);
});
