import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('etiquetas internas são protegidas, por volume e não contêm rastreio inventado',()=>{
 const page=read('src/app/admin/logistica/etiquetas-internas/[id]/page.tsx');
 assert.match(page,/requireAdmin\(\)/);
 assert.match(page,/checkShipmentPreparation\(/);
 assert.match(page,/review\.complete_for_manual_review/);
 assert.match(page,/rows\.map\(pkg/);
 assert.match(page,/pkg\.volume_number/);
 assert.match(page,/pkg\.weight_g/);
 assert.match(page,/DESTINATÁRIO/);
 assert.match(page,/NÃO VÁLIDA PARA POSTAGEM/);
 assert.match(page,/Não utilizar para postagem ou coleta/);
 assert.doesNotMatch(page,/tracking_code|createSignedUrl|order\.update/);
});
test('impressão é individual por etiqueta, em 10×15 cm',()=>{
 const css=read('src/app/admin/logistica/etiquetas-internas/[id]/labels.css');
 assert.match(css,/@page\{size:100mm 150mm/);
 assert.match(css,/break-after:page/);
 assert.match(css,/print-color-adjust:exact/);
 assert.match(css,/pope-label-toolbar\,.pope-label-intro\{display:none/);
 const page=read('src/app/admin/logistica/volumes/[id]/page.tsx');
 assert.match(page,/Imprimir etiquetas internas por volume/);
});
test('documentos oficiais ficam inacessíveis ao navegador nesta fase',()=>{
 const sql=read('supabase/shipment_workflow_and_private_documents_v1.sql');
 assert.match(sql,/pope-shipping-private/);
 assert.match(sql,/array\['application\/pdf'\]/);
 assert.match(sql,/false,8388608/);
 assert.match(sql,/revoke all on public\.shipment_provider_documents/);
 assert.match(sql,/revoke all on public\.shipment_tracking_provider_events/);
 assert.doesNotMatch(sql,/create policy.*storage\.objects/s);
});
