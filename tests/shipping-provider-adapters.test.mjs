import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PROVIDERS,providerPreparationReview} from '../src/lib/shipping/provider-adapters.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const check={complete_for_manual_review:true,issues:[],expected_volumes:1,
 registered_volumes:1,total_weight_g:950};
const volumes=[{volume_number:1,weight_g:950,height_cm:12.5,width_cm:20,length_cm:30,contents_note:null}];
const draft={
 order_id:'00000000-0000-4000-8000-000000000001',provider:'melhor_envio',
 service_code:'1',operator_notes:null,revision:2,
 draft_token:'00000000-0000-4000-8000-000000000002'
};
test('ambos integradores têm etapas explícitas, sem prometer integração oficial',()=>{
 assert.deepEqual(Object.keys(PROVIDERS).sort(),['correios','melhor_envio']);
 assert.ok(PROVIDERS.melhor_envio.workflow.includes('Checkout de frete'));
 assert.ok(PROVIDERS.correios.workflow.includes('Preparação de pré-postagem'));
});
test('revisão completa nunca autoriza compra de frete, etiqueta ou postagem',()=>{
 const result=providerPreparationReview({orderId:draft.order_id,draft,check,volumes});
 assert.equal(result.ready_for_internal_review,true);
 assert.equal(result.ready_for_provider_request,false);
 assert.equal(result.ready_for_label_purchase,false);
 assert.equal(result.shipment_purchased,false);
 assert.equal(result.cart_created,false);
 assert.equal(result.label_generated,false);
 assert.equal(result.official_tracking_created,false);
 assert.deepEqual(result.parcels[0].dimensions_cm,{height:12.5,width:20,length:30});
});
test('sem integrador e serviço, revisão registra as pendências',()=>{
 const missing=providerPreparationReview({orderId:draft.order_id,draft:null,check,volumes});
 assert.equal(missing.ready_for_internal_review,false);
 assert.ok(missing.basic_data_issues.some(x=>x.includes('Selecione')));
 const noService=providerPreparationReview({orderId:draft.order_id,
  draft:{...draft,service_code:null},check,volumes});
 assert.ok(noService.basic_data_issues.some(x=>x.includes('Código de serviço')));
});
test('erros estruturais impedem a revisão interna mesmo com transportadora selecionada',()=>{
 const result=providerPreparationReview({orderId:draft.order_id,draft,
  check:{...check,issues:['Peso ausente'],complete_for_manual_review:false},volumes});
 assert.equal(result.ready_for_internal_review,false);
 assert.ok(result.basic_data_issues.includes('Peso ausente'));
});
test('rascunho é admin-only, sem gravação direta nem serviço externo',()=>{
 const sql=read('supabase/shipment_provider_drafts_v1.sql');
 assert.match(sql,/enable row level security/);
 assert.match(sql,/private\.is_admin\(\)/);
 assert.match(sql,/status in \('paid','packing'\)/);
 assert.match(sql,/origin='admin_manual'/);
 assert.match(sql,/revision=public\.shipment_provider_drafts\.revision\+1/);
 assert.match(sql,/is distinct from/);
 assert.match(sql,/revoke all on table public\.shipment_provider_drafts/);
 assert.match(sql,/insert into public\.order_events/);
 const editor=read('src/app/admin/logistica/volumes/[id]/provider-editor.tsx');
 assert.match(editor,/\.rpc\('save_shipment_provider_draft'/);
 assert.doesNotMatch(editor,/\.from\('shipment_provider_drafts'\)\.upsert/);
});
test('exportação revalida admin e distingue conferência de compra real',()=>{
 const route=read('src/app/api/admin/shipping/preparation/[id]/route.ts');
 assert.match(route,/getClaims\(\)/);
 assert.match(route,/profile\?\.role!=='admin'/);
 assert.match(route,/\.eq\('origin','admin_manual'\)/);
 assert.match(route,/providerPreparationReview/);
 assert.match(route,/provider_review:providerReview/);
 assert.match(route,/ready_for_label_purchase:false/);
 assert.match(route,/private, no-store/);
 assert.doesNotMatch(route,/\bfetch\(/);
});
test('central de remessas exige admin e não movimenta pedidos',()=>{
 const page=read('src/app/admin/remessas/page.tsx');
 assert.match(page,/requireAdmin\(\)/);
 assert.match(page,/\.eq\('origin','admin_manual'\)/);
 assert.match(page,/\.in\('status',\['paid','packing'\]\)/);
 assert.doesNotMatch(page,/\.update\(|\.insert\(|\.delete\(/);
});
