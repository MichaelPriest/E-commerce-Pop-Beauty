import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 cartSnapshot,cartSnapshotKey,cartIsInactive,cartHasLaterOrder,
 cartRecoveryStatus,cartCurrentSubtotal,ABANDONMENT_MINUTES,CART_RETENTION_DAYS
} from '../src/lib/cart-recovery-core.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const productId='22222222-2222-4222-8222-222222222222';
const variantId='44444444-4444-4444-8444-444444444444';
const now=Date.parse('2026-11-23T14:00:00.000Z');
const iso=n=>new Date(now-n*60_000).toISOString();
const line={product_id:productId,variant_id:variantId,quantity:2};

test('apenas IDs e quantidades seguem ao snapshot, não preços, nomes ou dados pessoais',()=>{
 const items=cartSnapshot([{id:productId,variant_id:variantId,qty:2,
  name:'Batom',slug:'batom',price_cents:999999,sku:'SKU',image_url:'https://example.com/image.jpg'}]);
 assert.deepEqual(items,[line]);
 assert.equal(JSON.stringify(items).includes('999999'),false);
 assert.equal(cartSnapshotKey(items),cartSnapshotKey([line]));
 assert.equal(cartCurrentSubtotal(items,new Map([[productId,3599]])),7198);
 assert.equal(cartCurrentSubtotal(items,new Map()),0);
});

test('abandono exige uma hora sem atividade e considera no máximo 30 dias',()=>{
 assert.equal(ABANDONMENT_MINUTES,60);
 assert.equal(CART_RETENTION_DAYS,30);
 assert.equal(cartIsInactive(iso(59),now),false);
 assert.equal(cartIsInactive(iso(60),now),true);
 assert.equal(cartIsInactive(iso(90),now),true);
 assert.equal(cartIsInactive(iso(60*24*31),now),false);
 assert.equal(cartIsInactive('inválido',now),false);
});
test('pedido criado depois da alteração não é confundido com carrinho abandonado',()=>{
 const base={user_id:productId,items:[line],item_count:2,
  last_activity_at:iso(130),created_at:iso(240),
  reminders_opt_in:false,review_state:'new',reviewed_at:null};
 assert.equal(cartRecoveryStatus(base,[],now),'abandoned');
 assert.equal(cartRecoveryStatus(base,[iso(120)],now),'ordered');
 assert.equal(cartRecoveryStatus(base,[iso(150)],now),'abandoned');
 assert.equal(cartRecoveryStatus({...base,review_state:'closed'},[],now),'closed');
 assert.equal(cartRecoveryStatus({...base,item_count:0},[],now),'active');
 assert.equal(cartHasLaterOrder(iso(130),[iso(120)]),true);
});

test('migração isola clientes, valida SKUs, permite opt-in e não cria envios automáticos',()=>{
 const sql=read('supabase/customer_saved_carts_v1.sql');
 assert.match(sql,/alter table public\.customer_saved_carts enable row level security/);
 assert.match(sql,/saved_cart_own_read/);
 assert.match(sql,/user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/saved_cart_admin_triage/);
 assert.match(sql,/save_customer_cart\(p_items jsonb\)/);
 assert.match(sql,/set_saved_cart_reminders\(p_enabled boolean\)/);
 assert.match(sql,/security definer set search_path=''/);
 assert.match(sql,/v\.product_id=v_pid and v\.active/);
 assert.match(sql,/p\.active and not p\.is_adult/);
 assert.match(sql,/p\.role='customer'/);
 assert.match(sql,/octet_length\(p_items::text\)>8192/);
 assert.match(sql,/revoke all on public\.customer_saved_carts from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.save_customer_cart\(jsonb\) to authenticated/);
 assert.doesNotMatch(sql,/grant insert on public\.customer_saved_carts to authenticated/);
 assert.doesNotMatch(sql,/pg_cron|send_email|net\.http_post|mail_provider/);
});

test('só salva o carrinho da conta e não troca dados locais automaticamente',()=>{
 const sync=read('src/components/cart-cloud-sync.tsx');
 assert.match(sync,/if\(!userId\)return/);
 assert.match(sync,/\.eq\('user_id',userId\)/);
 assert.match(sync,/initial\.length&&saved\.length===0&&previousKey!==cartSnapshotKey\(saved\)/);
 assert.match(sync,/cartStore\.subscribe\(changed\)/);
 assert.doesNotMatch(sync,/cartStore\.write\(/);
 const cart=read('src/app/carrinho/page.tsx');
 assert.match(cart,/<SavedCartPanel\/>/);
 const panel=read('src/components/saved-cart-panel.tsx');
 assert.match(panel,/set_saved_cart_reminders/);
 assert.match(panel,/save_customer_cart/);
 assert.match(panel,/window\.confirm/);
 assert.match(panel,/cartStore\.write\(items\)/);
});

test('somente administradores veem carrinhos e valores nunca vêm do navegador',()=>{
 const page=read('src/app/admin/carrinhos-abandonados/page.tsx');
 assert.match(page,/requireAdmin\(\)/);
 assert.match(page,/\.eq\('storefront_order',true\)/);
 assert.match(page,/cartRecoveryStatus/);
 assert.match(page,/\.eq\('is_adult',false\)/);
 assert.match(page,/\.from\('customer_saved_carts'\)/);
 const manager=read('src/components/abandoned-carts-manager.tsx');
 assert.match(manager,/cartCurrentSubtotal/);
 assert.match(manager,/Sem autorização para lembretes/);
 assert.doesNotMatch(manager,/sendEmail\(|fetch\(['"]\/api\/email|mailchimp|resend\.emails\.send/);
 const shell=read('src/components/admin-shell.tsx');
 assert.match(shell,/href:'\/admin\/carrinhos-abandonados'/);
});

test('reels navegam verticalmente e mantém áudio sob controle do visitante',()=>{
 const client=read('src/components/feed-reels.tsx');
 const page=read('src/app/feed/videos/page.tsx');
 assert.match(client,/IntersectionObserver/);
 assert.match(client,/video\.muted=true/);
 assert.match(client,/video\.pause\(\)/);
 assert.match(client,/href=\{'\/produto\/'.*slug\}/);
 assert.match(page,/\.eq\('media_kind','video'\)/);
 assert.match(page,/\.eq\('status','published'\)/);
 assert.match(page,/feedPostViews/);
 assert.match(read('src/app/feed/page.tsx'),/href="\/feed\/videos"/);
 assert.match(read('src/components/header.tsx'),/href="\/feed\/videos"/);
});
