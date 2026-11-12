import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
 SHIPPING_PDF_BUCKET,MAX_SHIPPING_PDF_BYTES,
 canonicalShippingPdfPath,validateShippingPdfDocument
} from '../src/lib/shipping/private-document.ts';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const doc='5c9cfca7-c089-4929-8a3a-8027cb641513';
const order='43f1f08a-41a0-4265-9c95-102bb474c372';
const request='7acc21aa-caa0-4716-aaae-66aee8b7e6f1';
const path=canonicalShippingPdfPath(doc,order,request);
const bytes=Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const sha256=createHash('sha256').update(bytes).digest('hex');
const input={documentId:doc,orderId:order,requestId:request,
 objectPath:path,bucketId:SHIPPING_PDF_BUCKET,expectedSha256:sha256,bytes};

test('um documento pertence a pedido/solicitação/identificador canônicos',()=>{
 assert.equal(path,'orders/'+order+'/requests/'+request+'/'+doc+'.pdf');
 assert.equal(canonicalShippingPdfPath('wrong',order,request),null);
 assert.equal(validateShippingPdfDocument(input),true);
 assert.equal(validateShippingPdfDocument({...input,orderId:doc}),false);
 assert.equal(validateShippingPdfDocument({...input,bucketId:'product-images'}),false);
 assert.equal(validateShippingPdfDocument({...input,objectPath:'../private.pdf'}),false);
});
test('integridade, MIME básico e limite de tamanho são conferidos antes da liberação',()=>{
 assert.equal(validateShippingPdfDocument({...input,expectedSha256:'f'.repeat(64)}),false);
 assert.equal(validateShippingPdfDocument({...input,bytes:Buffer.from('not a pdf %%EOF')}),false);
 assert.equal(validateShippingPdfDocument({...input,bytes:Buffer.from('%PDF-1.4 but no final marker')}),false);
 assert.equal(validateShippingPdfDocument({...input,bytes:new Uint8Array(MAX_SHIPPING_PDF_BYTES+1)}),false);
});
test('estrutura do banco obriga vínculo do PDF e contém auditoria privada',()=>{
 const sql=read('supabase/shipment_secure_documents_readiness_v1.sql');
 assert.match(sql,/shipment_doc_request_order_fkey/);
 assert.match(sql,/shipment_tracking_request_order_fkey/);
 assert.match(sql,/shipment_document_canonical_path/);
 assert.match(sql,/shipment_document_access_events/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on public\.shipment_document_access_events/);
 assert.match(sql,/private\.is_admin\(\)/);
 assert.doesNotMatch(sql,/grant insert on public\.shipment_document_access_events to authenticated/);
});
test('download exige administrador, blob privado, hash e auditoria antes da resposta',()=>{
 const api=read('src/app/api/admin/shipping/documents/[id]/route.ts');
 assert.match(api,/getClaims\(\)/);
 assert.match(api,/profile\?\.role!=='admin'/);
 assert.match(api,/SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(api,/SHIPPING_PDF_BUCKET/);
 assert.match(api,/canonicalShippingPdfPath/);
 assert.match(api,/validateShippingPdfDocument/);
 assert.match(api,/shipment_document_access_events/);
 assert.match(api,/if\(auditError\)return failure/);
 assert.match(api,/Content-Disposition/);
 assert.match(api,/private, no-store/);
 assert.match(api,/\battachment\b/);
 assert.doesNotMatch(api,/createSignedUrl|NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
});
test('descarte interno bloqueia solicitações com documentos ou rastreios verificados',()=>{
 const sql=read('supabase/shipment_cancel_evidence_guard_v1.sql');
 assert.match(sql,/exists\(select 1 from public\.shipment_provider_documents/);
 assert.match(sql,/exists\(select 1 from public\.shipment_tracking_provider_events/);
 assert.match(sql,/guard_shipment_doc_insert/);
 assert.match(sql,/guard_shipment_tracking_insert/);
 assert.match(sql,/v_status is distinct from 'prepared_internal'/);
 assert.match(sql,/new\.provider is distinct from v_provider/);
});
test('as telas mostram documentos e eventos verificados sem permitir gravação cliente',()=>{
 const page=read('src/app/admin/remessas/evidencias/page.tsx');
 const detail=read('src/app/admin/logistica/volumes/[id]/page.tsx');
 const evidence=read('src/app/admin/logistica/volumes/[id]/provider-evidence.tsx');
 assert.match(page,/requireAdmin\(\)/);
 assert.match(page,/shipment_document_access_events/);
 assert.match(page,/shipment_provider_documents/);
 assert.match(page,/shipment_tracking_provider_events/);
 assert.match(detail,/ShippingProviderEvidence/);
 assert.match(evidence,/Nenhum documento oficial/);
 assert.match(evidence,/Nenhum evento autenticado/);
 assert.match(evidence,/api\/admin\/shipping\/documents/);
 assert.doesNotMatch(page,/\.insert\(|\.update\(|\.delete\(/);
});
