import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 normalizeCouponCode,validCouponCode,validCouponConfig,promotionCouponQuote
} from '../src/lib/promotions/coupon-core.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const now=new Date('2026-11-20T12:00:00.000Z');
const coupon={
 id:'22222222-2222-4222-8222-222222222222',code:'POPE15',description:'Campanha interna',
 discount_type:'percent',discount_value:15,min_subtotal_cents:5000,
 max_discount_cents:null,starts_at:'2026-11-18T10:00:00Z',
 ends_at:'2026-11-22T10:00:00Z',enabled:true,
 created_at:'2026-11-17T10:00:00Z',updated_at:'2026-11-17T10:00:00Z'
};

test('códigos de campanhas são normalizados e restritos',()=>{
 assert.equal(normalizeCouponCode(' pope_10 '),'POPE_10');
 assert.ok(validCouponCode('POPE10'));
 assert.ok(validCouponCode('A-12'));
 for(const code of ['A','ABC','COMPRA 10','a,b','R$10','X'.repeat(25),'BOM🎁']){
  assert.equal(validCouponCode(code),false,code);
 }
 assert.ok(validCouponConfig(coupon));
 assert.ok(!validCouponConfig({...coupon,discount_type:'percent',discount_value:91}));
 assert.ok(!validCouponConfig({...coupon,discount_type:'fixed',discount_value:50}));
 assert.ok(!validCouponConfig({...coupon,discount_type:'fixed',max_discount_cents:200}));
});

test('percentual é calculado com centavos e respeita teto e mínimo',()=>{
 assert.deepEqual(promotionCouponQuote(coupon,10000,now),{
  eligible:true,discount_cents:1500,total_cents:8500,
  message:'Simulação administrativa. Desconto ainda não aceito no checkout.'
 });
 assert.equal(promotionCouponQuote({...coupon,max_discount_cents:600},10000,now).discount_cents,600);
 assert.equal(promotionCouponQuote(coupon,9999,now).discount_cents,1499);
 assert.equal(promotionCouponQuote(coupon,4999,now).eligible,false);
 assert.equal(promotionCouponQuote({...coupon,discount_value:91},10000,now).eligible,false);
});

test('desconto fixo não reduz o total abaixo de zero',()=>{
 const fixed={...coupon,discount_type:'fixed',discount_value:5000,min_subtotal_cents:0};
 assert.deepEqual(promotionCouponQuote(fixed,2700,now),{
  eligible:true,discount_cents:2700,total_cents:0,
  message:'Simulação administrativa. Desconto ainda não aceito no checkout.'
 });
});

test('cupom inativo, agendado ou vencido não concede desconto',()=>{
 assert.equal(promotionCouponQuote({...coupon,enabled:false},10000,now).discount_cents,0);
 assert.equal(promotionCouponQuote(coupon,10000,new Date('2026-11-18T09:59:59Z')).eligible,false);
 assert.equal(promotionCouponQuote(coupon,10000,new Date('2026-11-18T10:00:00Z')).eligible,true);
 assert.equal(promotionCouponQuote(coupon,10000,new Date('2026-11-22T10:00:00Z')).eligible,false);
 assert.equal(promotionCouponQuote(coupon,NaN,now).eligible,false);
});

test('migração de cupons bloqueia visitantes, aplica RLS e não altera checkout',()=>{
 const sql=read('supabase/promotion_coupons_admin_v1.sql');
 assert.match(sql,/alter table public\.promotion_coupons enable row level security/);
 assert.match(sql,/revoke all on public\.promotion_coupons from public,anon,authenticated/);
 assert.match(sql,/for select to authenticated using \(\(select private\.is_admin\(\)\)\)/);
 assert.match(sql,/for insert to authenticated with check \(\(select private\.is_admin\(\)\)\)/);
 assert.match(sql,/for update to authenticated using \(\(select private\.is_admin\(\)\)\)/);
 assert.doesNotMatch(sql,/create (?:or replace )?function public\./i);
 assert.doesNotMatch(sql,/alter table public\.orders|commercial_checkout_enabled|grant .* to anon/);
 const app=read('src/app/admin/promocoes/page.tsx');
 const manager=read('src/app/admin/promocoes/coupon-manager.tsx');
 const shell=read('src/components/admin-shell.tsx');
 assert.match(app,/requireAdmin\(\)/);
 assert.match(manager,/\.from\('promotion_coupons'\)/);
 assert.match(manager,/\.eq\('updated_at',editing.updated_at\)/);
 assert.match(shell,/href:'\/admin\/promocoes'/);
 assert.match(manager,/não concede desconto no checkout|não altera pedidos/);
});
