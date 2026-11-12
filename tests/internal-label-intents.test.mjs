import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('intenção é única por pedido e só tem estado interno',()=>{
 const sql=read('supabase/internal_label_intents_v1.sql');
 assert.match(sql,/order_id uuid primary key/);
 assert.match(sql,/intent_key uuid not null unique/);
 assert.match(sql,/status text not null default 'prepared_internal' check\(status='prepared_internal'\)/);
 assert.doesNotMatch(sql,/status='purchased'|status='posted'|status='authorized'/);
});
test('RPC tem RLS, verificação de administrador e não autoriza chamada externa',()=>{
 const sql=read('supabase/internal_label_intents_v1.sql');
 assert.match(sql,/enable row level security/);
 assert.match(sql,/private\.is_admin\(\)/);
 assert.match(sql,/origin is distinct from 'admin_manual'/);
 assert.match(sql,/status not in \('paid','packing'\)/);
 assert.match(sql,/revoke all on public\.internal_label_intents/);
 assert.match(sql,/grant select on public\.internal_label_intents to authenticated/);
 assert.match(sql,/revoke all on function public\.stage_internal_label_intent/);
 assert.match(sql,/shipment_purchased',false/);
 assert.match(sql,/external_request_performed',false/);
});
test('repetição do mesmo snapshot conserva a intenção, mudanças geram chave nova',()=>{
 const sql=read('supabase/internal_label_intents_v1.sql');
 assert.match(sql,/on conflict\(order_id\) do update/);
 assert.match(sql,/source_fingerprint is distinct from excluded\.source_fingerprint/);
 assert.match(sql,/intent_key=gen_random_uuid\(\)/);
 assert.match(sql,/encode\(sha256\(convert_to\(/);
 assert.match(sql,/source_fingerprint/);
 assert.match(sql,/from public\.internal_label_intents where order_id=p_order_id/);
});
test('origem, destinatário, serviço e volumes são avaliados no banco',()=>{
 const sql=read('supabase/internal_label_intents_v1.sql');
 assert.match(sql,/from public\.shipping_origin_settings/);
 assert.match(sql,/from public\.shipment_provider_drafts/);
 assert.match(sql,/from public\.internal_package_preparations/);
 assert.match(sql,/from public\.internal_package_volumes/);
 assert.match(sql,/v_registered<>v_count/);
 assert.match(sql,/v_address/);
 const hardening=read('supabase/internal_label_intent_required_zip_phone_v2.sql');
 assert.match(hardening,/coalesce\(v_address->>'phone',''\)/);
 assert.match(hardening,/coalesce\(v_address->>'postal_code',''\)/);
});
test('fingerprint também inclui mercadorias, total e notas de embalagem',()=>{
 const sql=read('supabase/internal_label_intent_fingerprint_items_v3.sql');
 assert.match(sql,/from public\.order_items/);
 assert.match(sql,/'order_total_cents'/);
 assert.match(sql,/'packing_notes'/);
 assert.match(sql,/'items'/);
 assert.match(sql,/v_items_count<1/);
});
test('painel só registra intenção quando revisão e rascunho salvos',()=>{
 const editor=read('src/app/admin/logistica/volumes/[id]/provider-editor.tsx');
 assert.match(editor,/structurallyReady&&savedMatchesForm&&Boolean\(draft\?\.service_code\)/);
 assert.match(editor,/\.rpc\('stage_internal_label_intent'/);
 assert.match(editor,/Nenhum(a)? (etiqueta|frete)/i);
});
test('central de remessas mostra intenções sem dizer que foram emitidas',()=>{
 const page=read('src/app/admin/remessas/page.tsx');
 assert.match(page,/internal_label_intents/);
 assert.match(page,/Intenções internas registradas/);
 assert.match(page,/Verificar versão e dados atuais/);
});
