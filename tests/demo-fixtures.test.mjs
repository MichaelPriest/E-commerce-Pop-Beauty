import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('cenários fictícios são isolados em tabelas protegidas e não criam contas reais',()=>{
 const sql=read('supabase/demo_scenarios_v1.sql');
 assert.match(sql,/create table public\.demo_cart_scenarios/);
 assert.match(sql,/create table public\.demo_product_review_scenarios/);
 assert.match(sql,/create table public\.demo_feed_reels/);
 for(const table of ['demo_cart_scenarios','demo_product_review_scenarios','demo_feed_reels']){
  assert.match(sql,new RegExp('alter table public\\.'+table+' enable row level security'));
  assert.match(sql,new RegExp('revoke all on public\\.'+table+' from public,anon,authenticated'));
 }
 assert.match(sql,/demo_cart_admin_read[\s\S]*?private\.is_admin\(\)/);
 assert.match(sql,/demo_cart_admin_triage[\s\S]*?private\.is_admin\(\)/);
 assert.match(sql,/demo_review_editor_read[\s\S]*?private\.is_feed_editor\(\)/);
 assert.match(sql,/demo_reels_visible[\s\S]*?active=true/);
 assert.doesNotMatch(sql,/insert into auth\.(users|identities)|insert into public\.product_reviews\b|insert into public\.customer_saved_carts\b/);
});
test('cenários cobrem estados, avaliações 1–5 e vídeo CC0 sem reviews falsos públicos',()=>{
 const sql=read('supabase/demo_scenarios_v1.sql');
 for(let i=1;i<=7;i++)assert.match(sql,new RegExp('Cenário 0'+i));
 for(let i=1;i<=5;i++)assert.match(sql,new RegExp("Cliente fictício [A-E]"));
 assert.match(sql,/('published'|'hidden'|'pending')/);
 assert.match(sql,/media\/cc0-videos\/flower\.mp4/);
 assert.match(sql,/on conflict \(id\) do nothing/);
});
test('dashboard mostra dados reais e cenários fictícios em painéis distintos',()=>{
 const page=read('src/app/admin/carrinhos-abandonados/page.tsx');
 assert.match(page,/requireAdmin\(\)/);
 assert.match(page,/.from\('demo_cart_scenarios'\)/);
 assert.match(page,/Carrinhos reais/);
 assert.match(page,/Cenários simulados para homologação/);
 assert.match(page,/AbandonedCartsManager rows=\{rows\}/);
 assert.match(page,/AbandonedCartsManager rows=\{demoRows\} demo/);
 assert.match(page,/has_later_order/);
 const manager=read('src/components/abandoned-carts-manager.tsx');
 assert.match(manager,/demo\?'demo_cart_scenarios':'customer_saved_carts'/);
 assert.match(manager,/DADOS FICTÍCIOS/);
 assert.match(manager,/não enviar mensagens/);
});
test('moderação de avaliações de teste não modifica avaliações reais',()=>{
 const work=read('src/components/team-reviews-workspace.tsx');
 assert.match(work,/from\('demo_product_review_scenarios'\)/);
 assert.match(work,/Avaliações reais de clientes/);
 assert.match(work,/Avaliações simuladas/);
 const manager=read('src/components/reviews-manager.tsx');
 assert.match(manager,/demo\?'demo_product_review_scenarios':'product_reviews'/);
 assert.match(manager,/não aparecem\s+nas páginas dos produtos/i);
});
test('Reels público separa vídeo demonstrativo e conteúdo oficial',()=>{
 const page=read('src/app/feed/videos/page.tsx');
 assert.match(page,/posts\.length===0&&page===1&&!error/);
 assert.match(page,/\.from\('demo_feed_reels'\)/);
 assert.match(page,/VÍDEO DE TESTE/);
 assert.match(page,/displayVideos=isDemo\?demoVideos:posts/);
 assert.match(page,/produto exibido é ilustrativo/);
 const component=read('src/components/feed-reels.tsx');
 assert.match(component,/AMOSTRA DE TESTE/);
 assert.match(component,/Produto ilustrativo/);
});
