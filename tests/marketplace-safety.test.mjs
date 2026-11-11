import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('cofre fica no schema private sem permissão direta para cliente',()=>{
 const sql=read('supabase/marketplace_oauth_readonly.sql');
 assert.match(sql,/create table if not exists private\.marketplace_token_vault/);
 assert.match(sql,/revoke all on private\.marketplace_token_vault from public,anon,authenticated/);
 assert.match(sql,/create policy "marketplace_connections_admin_read"/);
 assert.match(sql,/create policy "marketplace_imports_admin_select"/);
});
test('sincronização não cria pedidos nem altera estoque comercial',()=>{
 const route=read('src/app/api/admin/marketplaces/sync/route.ts');
 assert.match(route,/marketplaceAdminSession\(\)/);
 assert.match(route,/readMarketplacePage\(/);
 assert.match(route,/marketplace_readonly_imports/);
 assert.doesNotMatch(route,/\.from\(['"]orders['"]\)/);
 assert.doesNotMatch(route,/\.from\(['"]inventory['"]\)/);
});
test('OAuth exige verificação de state e cookies HttpOnly',()=>{
 const start=read('src/app/api/admin/marketplaces/oauth/start/[channel]/route.ts');
 const callback=read('src/app/api/admin/marketplaces/oauth/callback/[channel]/route.ts');
 assert.match(start,/httpOnly:true/);
 assert.match(start,/sameSite:'lax'/);
 assert.match(callback,/timingSafeEqual/);
 assert.match(callback,/marketplaceVaultConfigured\(\)/);
});
