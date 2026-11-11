import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('cadastro físico possui RLS e somente RPC administrativa',()=>{
 const sql=read('supabase/internal_package_volumes_v1.sql');
 assert.match(sql,/enable row level security/);
 assert.match(sql,/private\.is_admin\(\)/);
 assert.match(sql,/origin='admin_manual'/);
 assert.match(sql,/status in \('paid','packing'\)/);
 assert.match(sql,/p_number>v_count/);
 assert.match(sql,/revoke all on public\.internal_package_volumes/);
});
test('tela protegida usa pedido interno e formulário salva via RPC',()=>{
 const page=read('src/app/admin/logistica/volumes/[id]/page.tsx');
 const editor=read('src/app/admin/logistica/volumes/[id]/volume-editor.tsx');
 assert.match(page,/requireAdmin\(\)/);
 assert.match(page,/\.eq\('origin','admin_manual'\)/);
 assert.match(editor,/\.rpc\('save_internal_package_volume'/);
 assert.doesNotMatch(editor,/\.from\('internal_package_volumes'\)\.upsert/);
});
