import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 evaluateProviderPurchaseObservation,PLAN_STATE_LABELS,PLAN_REVIEW_REASONS
} from '../src/lib/shipping/provider-reconciliation.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('sem despacho externo o resultado permanece bloqueado e não vendido',()=>{
 const result=evaluateProviderPurchaseObservation({kind:'never_dispatched'});
 assert.equal(result.outcome,'not_dispatched');
 assert.equal(result.action,'keep_blocked');
 assert.equal(result.automaticRetryAllowed,false);
 assert.equal(result.purchaseConfirmed,false);
});
test('timeout e resposta não verificada interrompem retry automático',()=>{
 for(const kind of ['dispatched_timeout','dispatched_unverified_response']){
  const result=evaluateProviderPurchaseObservation({kind});
  assert.equal(result.outcome,'unknown_external_state');
  assert.equal(result.automaticRetryAllowed,false);
  assert.equal(result.action,'manual_reconciliation_required');
  assert.equal(result.purchaseConfirmed,false);
 }
});
test('consulta futura do provedor nunca autoriza retry automaticamente',()=>{
 const confirmed=evaluateProviderPurchaseObservation({
  kind:'verified_purchase_found',providerOrderId:'ME-123'
 });
 assert.equal(confirmed.outcome,'verified_external_purchase');
 assert.equal(confirmed.purchaseConfirmed,true);
 assert.equal(confirmed.automaticRetryAllowed,false);
 const absent=evaluateProviderPurchaseObservation({
  kind:'verified_no_purchase_found',providerLookupId:'lookup-12'
 });
 assert.equal(absent.outcome,'verified_external_absence');
 assert.equal(absent.automaticRetryAllowed,false);
 assert.equal(absent.action,'manual_reconciliation_required');
 const invalid=evaluateProviderPurchaseObservation({
  kind:'verified_purchase_found',providerOrderId:'  '
 });
 assert.equal(invalid.outcome,'unknown_external_state');
});
test('tabelas bloqueiam compra por restrições SQL e permitem um plano por pedido',()=>{
 const sql=read('supabase/shipment_provider_operation_plans_blocked_v1.sql');
 assert.match(sql,/order_id uuid not null unique/);
 assert.match(sql,/guard_key uuid not null unique/);
 assert.match(sql,/external_dispatch_count integer not null default 0 check\(external_dispatch_count=0\)/);
 assert.match(sql,/external_order_id text check\(external_order_id is null\)/);
 assert.match(sql,/purchase_confirmed_at timestamptz check\(purchase_confirmed_at is null\)/);
 assert.match(sql,/blocked_no_dispatch/);
 assert.match(sql,/on conflict\(order_id\) do nothing/);
 assert.match(sql,/external_request_performed',false/);
 assert.match(sql,/safe_to_retry_purchase',false/);
 assert.match(sql,/revoke all on public\.shipment_provider_operation_plans/);
 assert.match(sql,/grant select on public\.shipment_provider_operation_plans to authenticated/);
 assert.match(sql,/private\.is_admin\(\)/);
 assert.match(sql,/where id=p_plan_id for update/);
 assert.doesNotMatch(sql,/fetch\(|https:\/\/|supabase\.functions\.invoke/);
});
test('RPCs exigem papel admin, negam anon e registram somente revisões internas',()=>{
 const sql=read('supabase/shipment_provider_operation_plans_blocked_v1.sql');
 for(const name of [
  'stage_shipment_provider_operation_plan',
  'review_shipment_provider_operation_plan',
  'archive_shipment_provider_operation_plan'
 ]){
  assert.match(sql,new RegExp('revoke all on function public\\.'+name));
  assert.match(sql,new RegExp('grant execute on function public\\.'+name));
 }
 assert.match(sql,/plan_created_internal/);
 assert.match(sql,/review_requested_internal/);
 assert.match(sql,/review_archived_internal/);
 assert.match(sql,/state='archived_internal'/);
 assert.match(sql,/SEM CHAMADA EXTERNA/);
});
test('congelamento do checklist, chave e descarte evita criar segundo plano',()=>{
 const sql=read('supabase/shipment_operation_plan_freeze_workflow_v2.sql');
 assert.match(sql,/private\.reserve_shipment_purchase_guard/);
 assert.match(sql,/private\.save_shipment_purchase_preflight/);
 assert.match(sql,/private\.void_internal_shipment_request/);
 assert.match(sql,/where op\.order_id=v_req\.order_id/);
 assert.match(sql,/checklist é imutável/);
 assert.match(sql,/Solicitação/);
 assert.match(sql,/where order_id=v_request\.order_id/);
 assert.match(sql,/public\.shipment_provider_operation_plans/);
});
test('UI lista planos reais somente e nunca afirma compra efetuada',()=>{
 const page=read('src/app/admin/remessas/reconciliacao/page.tsx');
 const panel=read('src/app/admin/logistica/volumes/[id]/operation-plan-panel.tsx');
 const detail=read('src/app/admin/logistica/volumes/[id]/page.tsx');
 const index=read('src/app/admin/remessas/page.tsx');
 assert.match(page,/requireAdmin\(\)/);
 assert.match(page,/shipment_provider_operation_plans/);
 assert.match(page,/shipment_operation_plan_events/);
 assert.match(page,/Nenhum plano registrado/);
 assert.doesNotMatch(page,/\.insert\(|\.update\(|\.delete\(/);
 assert.match(panel,/stage_shipment_provider_operation_plan/);
 assert.match(panel,/review_shipment_provider_operation_plan/);
 assert.match(panel,/archive_shipment_provider_operation_plan/);
 assert.match(panel,/window\.confirm\(/);
 assert.match(detail,/ShippingOperationPlanPanel/);
 assert.match(index,/remessas\/reconciliacao/);
 assert.equal(PLAN_STATE_LABELS.blocked_no_dispatch.includes('sem envio'),true);
 assert.match(PLAN_REVIEW_REASONS.timeout_policy_review,/não é ocorrência real/);
});
