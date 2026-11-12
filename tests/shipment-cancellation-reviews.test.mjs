import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('supabase/shipment_cancellation_review_queue_v1.sql');

test('revisão não cria comando externo e requer evidência oficial',()=>{
 assert.match(sql,/unique/);
 assert.match(sql,/request_id uuid not null unique/);
 assert.match(sql,/exists\(select 1 from public\.shipment_provider_documents/);
 assert.match(sql,/exists\(select 1 from public\.shipment_tracking_provider_events/);
 assert.match(sql,/provider_cancellation_requested',false/);
 assert.match(sql,/provider_cancellation_performed',false/);
 assert.match(sql,/refund_performed',false/);
 assert.match(sql,/shipment_status_changed',false/);
 assert.doesNotMatch(sql,/https?:\/\//);
});
test('RPCs administrativas e RLS impedem criação/cancelamento por cliente direto',()=>{
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on public\.shipment_cancellation_reviews/);
 assert.match(sql,/private\.is_admin\(\)/);
 assert.match(sql,/revoke all on function public\.open_shipment_cancellation_review/);
 assert.match(sql,/revoke all on function public\.dismiss_shipment_cancellation_review/);
 assert.match(sql,/on conflict\(request_id\) do nothing/);
 assert.match(sql,/where id=p_review_id for update/);
 assert.match(sql,/dismissed_internal/);
});
test('o painel só oferece revisão para remessa com evidência e confirmação ao encerrar',()=>{
 const component=read('src/app/admin/logistica/volumes/[id]/cancellation-review-panel.tsx');
 const details=read('src/app/admin/logistica/volumes/[id]/page.tsx');
 assert.match(component,/requestId&&hasProviderEvidence&&!existing/);
 assert.match(component,/open_shipment_cancellation_review/);
 assert.match(component,/dismiss_shipment_cancellation_review/);
 assert.match(component,/window\.confirm/);
 assert.match(component,/NÃO cancela etiquetas/);
 assert.match(details,/CancellationReviewPanel/);
 assert.match(details,/shipment_cancellation_reviews/);
 assert.match(details,/providerDocs\.data/);
 assert.match(details,/providerTracking\.data/);
});
test('fila consolidada é somente leitura e protegida por requireAdmin',()=>{
 const page=read('src/app/admin/remessas/cancelamentos/page.tsx');
 const central=read('src/app/admin/remessas/page.tsx');
 assert.match(page,/requireAdmin\(\)/);
 assert.match(page,/shipment_cancellation_reviews/);
 assert.match(page,/Nenhuma revisão de cancelamento/);
 assert.match(central,/admin\/remessas\/cancelamentos/);
 assert.doesNotMatch(page,/\.insert\(|\.update\(|\.delete\(/);
});
