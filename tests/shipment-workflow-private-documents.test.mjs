import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REQUEST_STATUS_LABELS,INTERNAL_EVENT_LABELS,ALLOWED_INTERNAL_REVIEWS}
 from '../src/lib/shipping/internal-workflow.ts';
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const schema=read('supabase/shipment_workflow_and_private_documents_v1.sql');

test('bucket de etiquetas e comprovantes é privado, apenas PDF e limitado a 8MB',()=>{
 assert.match(schema,/pope-shipping-private/);
 assert.match(schema,/false,8388608,array\['application\/pdf'\]/);
 assert.match(schema,/public=false/);
 assert.doesNotMatch(schema,/create policy.*storage\.objects/);
});
test('Tabelas de documentos e rastreamento não permitem escrita direta ou pública',()=>{
 for(const table of ['shipment_provider_documents','shipment_tracking_provider_events']){
  assert.match(schema,new RegExp('alter table public\\.'+table+' enable row level security'));
  assert.match(schema,new RegExp('revoke all on public\\.'+table+' from public,anon,authenticated'));
  assert.match(schema,new RegExp('grant select on public\\.'+table+' to authenticated'));
 }
 assert.match(schema,/provider_authenticated/);
 assert.match(schema,/unique\(provider,provider_event_id\)/);
 assert.match(read('supabase/shipment_documents_path_regex_v2.sql'),/\[\.\]pdf\$/);
});
test('pedido e versão únicos garantem idempotência da preparação',()=>{
 assert.match(schema,/unique\(order_id,intent_key\)/);
 assert.match(schema,/on conflict\(order_id,intent_key\) do nothing/);
 assert.match(schema,/private\.stage_internal_label_intent\(p_order_id\)/);
 assert.match(schema,/v_stage->>'changed'/);
 assert.match(schema,/source_fingerprint/);
 assert.match(schema,/shipment_purchased',false/);
 assert.match(schema,/label_generated',false/);
 assert.match(schema,/tracking_created',false/);
});
test('descarte interno não se apresenta como cancelamento oficial',()=>{
 assert.match(schema,/where id=p_request_id for update/);
 assert.match(schema,/provider_cancellation_performed',false/);
 assert.match(schema,/voided_internal/);
 assert.match(schema,/não é cancelamento na transportadora/);
 assert.match(schema,/insert into public\.shipment_internal_events/);
 assert.match(schema,/event_type,actor_id/);
});
test('RPCs exigem papel admin e não são acessíveis por anon',()=>{
 for(const name of ['prepare_shipment_workflow_request','void_internal_shipment_request',
  'log_internal_shipment_review']){
  assert.match(schema,new RegExp('create or replace function private\\.'+name));
  assert.match(schema,new RegExp('revoke all on function public\\.'+name));
 }
 assert.match(schema,/auth\.uid\(\) is null or not private\.is_admin\(\)/);
 assert.match(schema,/grant execute on function public\.prepare_shipment_workflow_request/);
});
test('ocorrências internas não contêm status falsos de transportadora',()=>{
 assert.deepEqual([...ALLOWED_INTERNAL_REVIEWS].sort(),[
  'address_reviewed','carrier_pending','fiscal_pending','packages_reviewed'
 ]);
 assert.match(REQUEST_STATUS_LABELS.prepared_internal,/interna/i);
 assert.match(REQUEST_STATUS_LABELS.voided_internal,/internamente/i);
 assert.match(INTERNAL_EVENT_LABELS.request_voided,/descartad/i);
 assert.ok(!Object.keys(INTERNAL_EVENT_LABELS).some(x=>['delivered','shipped','label_purchased'].includes(x)));
});
test('telas e formulário restritos à administração exibem a distinção operacional',()=>{
 const page=read('src/app/admin/remessas/solicitacoes/page.tsx');
 const detail=read('src/app/admin/logistica/volumes/[id]/page.tsx');
 const panel=read('src/app/admin/logistica/volumes/[id]/workflow-panel.tsx');
 assert.match(page,/requireAdmin\(\)/);
 assert.match(page,/shipment_workflow_requests/);
 assert.match(page,/shipment_provider_documents/);
 assert.match(page,/shipment_tracking_provider_events/);
 assert.match(detail,/ShippingWorkflowPanel/);
 assert.match(detail,/shipment_internal_events/);
 for(const rpc of ['prepare_shipment_workflow_request','void_internal_shipment_request',
  'log_internal_shipment_review'])assert.match(panel,new RegExp(rpc));
 assert.match(panel,/window\.confirm\(/);
 assert.match(panel,/não geram PLP/);
 assert.doesNotMatch(page,/\.insert\(|\.update\(|\.delete\(/);
});
