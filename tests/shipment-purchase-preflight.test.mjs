import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 classifyPreflight,classifyPurchaseGuard,PREFLIGHT_LABELS,GUARD_LABELS
} from '../src/lib/shipping/preflight-status.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const request={
 id:'request-a',status:'prepared_internal',intent_key:'intent-1',
 source_fingerprint:'f'.repeat(64)
};
const intent={intent_key:request.intent_key,source_fingerprint:request.source_fingerprint};
const review={request_id:request.id,intent_key:request.intent_key,
 source_fingerprint:request.source_fingerprint,review_key:'review-1',
 checklist_complete_internal:true};
const guard={request_id:request.id,intent_key:request.intent_key,
 source_fingerprint:request.source_fingerprint,preflight_review_key:'review-1',
 status:'blocked_homologation'};

test('classificação de checklist é conservadora diante de versões e descartes',()=>{
 assert.equal(classifyPreflight(request,intent,null),'missing_review');
 assert.equal(classifyPreflight(request,intent,review),'complete_internal');
 assert.equal(classifyPreflight(request,intent,{...review,checklist_complete_internal:false}),
  'review_incomplete');
 assert.equal(classifyPreflight(request,{...intent,intent_key:'new'},review),'intent_replaced');
 assert.equal(classifyPreflight(request,{...intent,source_fingerprint:'0'.repeat(64)},review),
  'intent_replaced');
 assert.equal(classifyPreflight({...request,status:'voided_internal'},intent,review),
  'request_voided');
 assert.equal(classifyPreflight(request,intent,{...review,request_id:'other'}),
  'intent_replaced');
 assert.match(PREFLIGHT_LABELS.complete_internal,/sem compra/i);
});
test('chave técnica só é atual se a revisão e a origem coincidirem',()=>{
 assert.equal(classifyPurchaseGuard(request,intent,review,null),'not_registered');
 assert.equal(classifyPurchaseGuard(request,intent,review,guard),'blocked_homologation');
 assert.equal(classifyPurchaseGuard(request,intent,review,{...guard,preflight_review_key:'old'}),
  'obsolete');
 assert.equal(classifyPurchaseGuard(request,intent,
  {...review,checklist_complete_internal:false},guard),'obsolete');
 assert.equal(classifyPurchaseGuard(request,intent,review,{...guard,status:'purchased'}),
  'obsolete');
 assert.equal(classifyPurchaseGuard(request,null,review,guard),'obsolete');
 assert.match(GUARD_LABELS.blocked_homologation,/compra bloqueada/i);
});
test('tabela de checklist limita escrita por RLS e exige cinco campos explícitos',()=>{
 const sql=read('supabase/shipment_purchase_preflights_v1.sql');
 assert.match(sql,/unique/);
 assert.match(sql,/request_id uuid not null unique/);
 assert.match(sql,/checklist_complete_internal boolean generated always as/);
 for(const column of ['recipient_checked','packages_checked','payment_checked',
  'fiscal_checked','carrier_terms_checked']){
  assert.match(sql,new RegExp(column+' boolean not null default false'));
 }
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on public\.shipment_purchase_preflights/);
 assert.match(sql,/private\.is_admin\(\)/);
 assert.match(sql,/on conflict\(request_id\) do update/);
 assert.match(sql,/is distinct from/);
 assert.match(sql,/ready_for_label_purchase',false/);
 assert.match(sql,/fiscal_authorized',false/);
 assert.match(sql,/provider_request_performed',false/);
 assert.match(sql,/fiscal_order_drafts/);
});
test('lock order e revalidação de fingerprint protegem a revisão',()=>{
 const sql=read('supabase/shipment_purchase_preflight_lock_order_v2.sql');
 assert.match(sql,/private\.stage_internal_label_intent\(v_request\.order_id\)/);
 assert.match(sql,/where id=p_request_id for update/);
 assert.match(sql,/source_fingerprint is distinct from v_request\.source_fingerprint/);
 const stage=sql.indexOf('v_stage:=private.stage_internal_label_intent');
 const lock=sql.indexOf('where id=p_request_id for update');
 assert.ok(stage>0&&lock>stage);
});
test('guarda única por pedido nunca muda status bloqueado',()=>{
 const sql=read('supabase/shipment_purchase_guard_blocked_v1.sql');
 assert.match(sql,/order_id uuid primary key/);
 assert.match(sql,/guard_key uuid not null unique/);
 assert.match(sql,/status text not null default 'blocked_homologation'/);
 assert.match(sql,/check\(status='blocked_homologation'\)/);
 assert.match(sql,/on conflict\(order_id\) do update/);
 assert.match(sql,/preflight_review_key/);
 assert.match(sql,/v_preflight\.checklist_complete_internal is distinct from true/);
 assert.match(sql,/ready_for_label_purchase',false/);
 assert.match(sql,/external_request_performed',false/);
 assert.match(sql,/shipment_purchased',false/);
 assert.match(sql,/revoke all on public\.shipment_purchase_guards/);
 assert.match(sql,/revoke all on function public\.reserve_shipment_purchase_guard/);
});
test('evidências de versões antigas do pedido também impedem nova chave',()=>{
 const sql=read('supabase/shipment_purchase_guard_order_wide_evidence_v2.sql');
 assert.match(sql,/public\.shipment_provider_documents/);
 assert.match(sql,/public\.shipment_tracking_provider_events/);
 assert.match(sql,/where order_id=v_req\.order_id/);
 assert.match(sql,/public\.shipment_cancellation_reviews/);
});
test('interface limita checklist e chave técnica ao fluxo administrativo',()=>{
 const panel=read('src/app/admin/logistica/volumes/[id]/preflight-panel.tsx');
 const guardPanel=read('src/app/admin/logistica/volumes/[id]/purchase-guard-panel.tsx');
 const page=read('src/app/admin/logistica/volumes/[id]/page.tsx');
 const dashboard=read('src/app/admin/remessas/precontratacao/page.tsx');
 assert.match(panel,/save_shipment_purchase_preflight/);
 assert.match(panel,/Conferir preparação fiscal/);
 assert.match(panel,/NÃO existe autorização de/);
 assert.match(panel,/!hasProviderEvidence&&!hasCancellationPending/);
 assert.match(guardPanel,/reserve_shipment_purchase_guard/);
 assert.match(guardPanel,/blocked_homologation/);
 assert.match(guardPanel,/NÃO é chave de idempotência|não garante idempotência/i);
 assert.match(page,/ShipmentPurchasePreflight/);
 assert.match(page,/PurchaseGuardPanel/);
 assert.match(dashboard,/requireAdmin\(\)/);
 assert.match(dashboard,/shipment_purchase_preflights/);
 assert.match(dashboard,/shipment_purchase_guards/);
 assert.doesNotMatch(dashboard,/\.insert\(|\.update\(|\.delete\(/);
});
