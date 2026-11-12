import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sandboxQuoteReferenceStatus,SANDBOX_QUOTE_STATUS_LABELS}
 from '../src/lib/shipping/quote-history.ts';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('classificação de histórico distingue intenção substituída, vencida e janela técnica',()=>{
 const now=Date.parse('2026-11-12T12:00:00Z');
 assert.equal(sandboxQuoteReferenceStatus('a','2026-11-12T12:15:00Z','b',now),
  'intent_replaced');
 assert.equal(sandboxQuoteReferenceStatus('a','2026-11-12T11:59:59Z','a',now),
  'expired');
 assert.equal(sandboxQuoteReferenceStatus('a','2026-11-12T12:15:00Z','a',now),
  'reference_window');
 assert.equal(sandboxQuoteReferenceStatus('a','invalid','a',now),'expired');
 assert.equal(sandboxQuoteReferenceStatus('a','2026-11-12T12:15:00Z',null,now),
  'intent_replaced');
 assert.match(SANDBOX_QUOTE_STATUS_LABELS.reference_window,/revalida/);
});
test('schema impede custo comercial, vazamento e gravação direta',()=>{
 const sql=read('supabase/shipment_sandbox_quote_snapshots_v1.sql');
 assert.match(sql,/enable row level security/);
 assert.match(sql,/for select to authenticated/);
 assert.match(sql,/private\.is_admin\(\)/);
 assert.match(sql,/revoke all on public\.shipment_sandbox_quote_snapshots/);
 assert.match(sql,/grant select on public\.shipment_sandbox_quote_snapshots to authenticated/);
 assert.match(sql,/environment text not null default 'sandbox' check\(environment='sandbox'\)/);
 assert.match(sql,/reference_expires_at timestamptz/);
 assert.match(sql,/15 minutes/);
 assert.doesNotMatch(sql,/tracking_code|authorization_token|api_secret|shipping_address_snapshot/);
});
test('a RPC confronta a intenção atual em transação e limita uso',()=>{
 const sql=read('supabase/shipment_sandbox_quote_snapshots_v1.sql');
 assert.match(sql,/private\.stage_internal_label_intent\(p_order_id\)/);
 assert.match(sql,/v_stage->>'changed'/);
 assert.match(sql,/v_intent\.source_fingerprint/);
 assert.match(sql,/v_intent\.service_code is distinct from v_service/);
 assert.match(sql,/for update/);
 assert.match(sql,/v_count>=30/);
 assert.match(sql,/shipment_purchased',false/);
 assert.match(sql,/label_generated',false/);
 assert.match(sql,/revoke all on function public\.record_shipment_sandbox_quote/);
});
test('backend só armazena valor que passou pelo parser da sandbox',()=>{
 const route=read('src/app/api/admin/shipping/order-quote/[id]/route.ts');
 assert.match(route,/parseOrderSandboxQuotes\(raw,intent\.service_code\)/);
 assert.match(route,/quotes\.length/);
 assert.match(route,/record_shipment_sandbox_quote/);
 assert.match(route,/quote_saved:!!snapshot/);
 assert.match(route,/quote_snapshot_id:snapshot\?\.snapshot_id/);
 assert.match(route,/quote_expires_at:snapshot\?\.expires_at/);
 assert.match(route,/stage_internal_label_intent/);
 assert.match(route,/https:\/\/sandbox\.melhorenvio\.com\.br\/api\/v2\/me\/shipment\/calculate/);
 assert.doesNotMatch(route,/\/cart\b|\/purchase\b|\/generate\b/);
});
test('histórico e preparo exigem admin e usam apenas dados normalizados',()=>{
 const detail=read('src/app/admin/logistica/volumes/[id]/page.tsx');
 const page=read('src/app/admin/remessas/cotacoes/page.tsx');
 const editor=read('src/app/admin/logistica/volumes/[id]/provider-editor.tsx');
 assert.match(detail,/requireAdmin\(\)/);
 assert.match(detail,/shipment_sandbox_quote_snapshots/);
 assert.match(page,/requireAdmin\(\)/);
 assert.match(page,/shipment_sandbox_quote_snapshots/);
 assert.match(page,/reference_expires_at/);
 assert.match(editor,/SANDBOX_QUOTE_STATUS_LABELS/);
 assert.doesNotMatch(page,/\.update\(|\.insert\(|\.delete\(/);
});
