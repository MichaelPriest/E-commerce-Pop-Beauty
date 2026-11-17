import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 summarizeOrderCenter,nextOrderCenterStep,ORDER_CENTER_TONE_LABEL
} from '../src/lib/orders/order-command-center.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const base={
 origin:'admin_manual',status:'pending',itemCount:2,
 hasManualPaymentReference:false,hasManualCarrierTracking:false,
 sandboxPaymentAttempts:0,sandboxWebhookReceipts:0,
 hasFiscalDraft:false,hasFiscalRecipient:false,fiscalIntegrationStatus:null,
 plannedVolumes:null,registeredVolumes:0,internalRequests:0,
 officialDocuments:0,verifiedTrackingEvents:0,
 sentNotifications:0,pendingNotifications:0,failedNotifications:0
};
const find=(steps,id)=>steps.find(x=>x.id===id);

test('pedido manual pendente não se transforma em pagamento confirmado',()=>{
 const steps=summarizeOrderCenter(base);
 assert.equal(steps.length,6);
 assert.equal(find(steps,'payment').state,'pending');
 assert.equal(find(steps,'payment').label,'Aguardando conferência manual');
 assert.equal(nextOrderCenterStep(steps,'pending').id,'payment');
 assert.equal(find(steps,'fiscal').state,'pending');
 assert.equal(find(steps,'shipping').state,'pending');
});
test('marcação manual de entregue não é comprovante bancário nem entrega do transportador',()=>{
 const steps=summarizeOrderCenter({...base,status:'delivered',
  hasManualPaymentReference:true,hasManualCarrierTracking:true});
 assert.equal(find(steps,'payment').state,'manual_review');
 assert.match(find(steps,'payment').description,/Não é confirmação bancária/);
 assert.equal(find(steps,'shipping').state,'manual_review');
 assert.match(find(steps,'shipping').description,/não há validação/);
 assert.equal(find(steps,'fiscal').state,'pending');
});
test('documento fiscal interno nunca é apresentado como NF-e autorizada',()=>{
 const steps=summarizeOrderCenter({...base,status:'packing',hasFiscalDraft:true,
  hasFiscalRecipient:true,fiscalIntegrationStatus:'draft'});
 assert.equal(find(steps,'fiscal').state,'manual_review');
 assert.match(find(steps,'fiscal').description,/Nenhuma autorização SEFAZ/);
});
test('caixa e solicitação interna não provam postagem ou rastreamento oficial',()=>{
 const steps=summarizeOrderCenter({...base,status:'packing',
  plannedVolumes:2,registeredVolumes:2,internalRequests:1});
 assert.equal(find(steps,'packing').state,'manual_review');
 assert.equal(find(steps,'shipping').state,'pending');
 assert.match(find(steps,'shipping').description,/preparação interna/);
 const withEvidence=summarizeOrderCenter({...base,officialDocuments:1,
  verifiedTrackingEvents:2});
 assert.equal(find(withEvidence,'shipping').state,'manual_review');
 assert.match(find(withEvidence,'shipping').description,/Confira a autenticidade/);
});
test('pagamento sandbox e webhooks não são baixa bancária',()=>{
 const steps=summarizeOrderCenter({...base,origin:'store_api',
  sandboxPaymentAttempts:2,sandboxWebhookReceipts:1});
 assert.equal(find(steps,'payment').state,'manual_review');
 assert.match(find(steps,'payment').description,/Nenhum constitui confirmação/);
});
test('confirmação e contestação do gateway mudam a etapa de pagamento',()=>{
 const paid=summarizeOrderCenter({...base,status:'paid',gatewayPaymentState:'confirmed'});
 assert.equal(find(paid,'payment').label,'Aprovado pelo Mercado Pago');
 const disputed=summarizeOrderCenter({...base,status:'paid',gatewayPaymentState:'review'});
 assert.equal(nextOrderCenterStep(disputed,'paid').id,'payment');
});
test('notificações com falha têm precedência sobre fila pendente',()=>{
 const steps=summarizeOrderCenter({...base,sentNotifications:1,
  pendingNotifications:2,failedNotifications:3});
 assert.equal(find(steps,'notifications').state,'pending');
 assert.equal(find(steps,'notifications').label,'Falhas de envio');
 assert.equal(find(summarizeOrderCenter({...base,sentNotifications:1}),'notifications').state,
  'complete_internal');
});
test('pedido cancelado não propõe nova ação operacional',()=>{
 const steps=summarizeOrderCenter({...base,status:'cancelled'});
 assert.equal(nextOrderCenterStep(steps,'cancelled'),null);
 assert.equal(find(steps,'payment').state,'not_applicable');
 assert.ok(ORDER_CENTER_TONE_LABEL.manual_review.includes('conferência'));
});
test('rota individual exige admin e lista somente evidências daquele pedido',()=>{
 const page=read('src/app/admin/pedidos/[id]/page.tsx');
 assert.match(page,/requireAdmin\(\)/);
 assert.match(page,/if\(!uuid\.test\(id\)\)notFound\(\)/);
 assert.match(page,/\.eq\('id',id\)\.maybeSingle\(\)/);
 assert.match(page,/\.eq\('order_id',id\)/);
 assert.match(page,/order_events/);
 assert.match(page,/fiscal_order_drafts/);
 assert.match(page,/shipment_provider_documents/);
 assert.match(page,/shipment_tracking_provider_events/);
 assert.match(page,/sandbox_payment_attempts/);
 assert.match(page,/payment_webhook_receipts/);
 assert.match(page,/ORDER_CENTER_TONE_LABEL/);
 assert.match(page,/commercial_payment_checkouts/);
 assert.match(page,/<OrderPaymentActions orderId=\{id\}/);
 assert.doesNotMatch(page,/\.insert\(|\.update\(|\.delete\(|fetch\('/);
});
test('central de pedidos oferece atalho por registro e deep-link fiscal seleciona pedido',()=>{
 const orders=read('src/app/admin/pedidos/orders-manager.tsx');
 const fiscal=read('src/app/admin/fiscal/page.tsx');
 const manager=read('src/app/admin/fiscal/fiscal-manager.tsx');
 assert.match(orders,/href=\{'\/admin\/pedidos\/'\+o\.id\}/);
 assert.match(orders,/new URLSearchParams\(window\.location\.search\)/);
 assert.match(fiscal,/searchParams:Promise<\{pedido\?:string\}>/);
 assert.match(fiscal,/initialOrderId=/);
 assert.match(manager,/initialSelectedOrder/);
 assert.match(manager,/'orders':'issuer'/);
});
