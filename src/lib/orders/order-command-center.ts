/** Resumo administrativo conservador: nunca deduz recebimento, nota autorizada
 * ou entrega de uma simples mudança manual de status.
 */
export type OrderCenterTone='complete_internal'|'manual_review'|'pending'|'not_applicable';
export type OrderCenterStepId='order'|'payment'|'fiscal'|'packing'|'shipping'|'notifications';
export type OrderCenterStep={
 id:OrderCenterStepId;title:string;state:OrderCenterTone;
 label:string;description:string;
};
export type OrderCenterInput={
 origin:string;status:string;
 itemCount:number;
 hasManualPaymentReference:boolean;hasManualCarrierTracking:boolean;
 sandboxPaymentAttempts:number;sandboxWebhookReceipts:number;
 hasFiscalDraft:boolean;hasFiscalRecipient:boolean;
 fiscalIntegrationStatus:string|null;
 plannedVolumes:number|null;registeredVolumes:number;
 internalRequests:number;officialDocuments:number;verifiedTrackingEvents:number;
 sentNotifications:number;pendingNotifications:number;failedNotifications:number;
};
const step=(id:OrderCenterStepId,title:string,state:OrderCenterTone,
 label:string,description:string):OrderCenterStep=>({id,title,state,label,description});

export function summarizeOrderCenter(data:OrderCenterInput):OrderCenterStep[]{
 const cancelled=data.status==='cancelled';
 const manual=data.origin==='admin_manual';
 const manualProgress=['paid','packing','shipped','delivered'].includes(data.status);
 const items=step('order','Pedido',
  data.itemCount>0?'complete_internal':'pending',
  data.itemCount>0?'Itens registrados':'Itens não localizados',
  data.itemCount>0?`${data.itemCount} item(ns) cadastrado(s) no pedido.`:
   'Confira os produtos e a integridade do registro.');
 let payment:OrderCenterStep;
 if(cancelled)payment=step('payment','Pagamento','not_applicable','Pedido cancelado',
  'Não deduzir recebimento nem estorno a partir do cancelamento.');
 else if(manual)payment=manualProgress?
  step('payment','Pagamento','manual_review','Marcação administrativa',
   'O status foi alterado no fluxo manual. Não é confirmação bancária ou de gateway.') :
  step('payment','Pagamento','pending','Aguardando conferência manual',
   'Confirme comprovantes externos antes de alterar o status do pedido.');
 else payment=step('payment','Pagamento','manual_review',
  data.sandboxPaymentAttempts?'Homologação registrada':'Sem tentativa comercial confirmada',
  `${data.sandboxPaymentAttempts} tentativa(s) sandbox; ${data.sandboxWebhookReceipts} retorno(s) vinculados. Nenhum constitui confirmação de recebimento comercial.`);

 const fiscal=data.hasFiscalDraft?
  step('fiscal','Fiscal','manual_review','Rascunho administrativo',
   data.hasFiscalRecipient?
    'Emitente/destinatário e rascunho podem ser conferidos. Nenhuma autorização SEFAZ foi confirmada.' :
    'Rascunho presente, mas o destinatário fiscal ainda precisa de conferência. Não é nota emitida.') :
  step('fiscal','Fiscal',cancelled?'not_applicable':'pending',
   cancelled?'Sem emissão documentada':'Preparação fiscal não iniciada',
   data.fiscalIntegrationStatus?
    'Há registro de integração, mas ele não comprova autorização da SEFAZ.' :
    'Não há rascunho fiscal registrado. Não confundir impressão interna com NF-e autorizada.');

 const packing=(data.plannedVolumes!==null&&data.plannedVolumes>0&&
  data.registeredVolumes===data.plannedVolumes)?
  step('packing','Separação','manual_review','Volumes registrados',
   `${data.registeredVolumes} volume(s) cadastrado(s). A preparação física precisa de conferência humana.`) :
  step('packing','Separação',cancelled?'not_applicable':'pending',
   data.registeredVolumes?'Conferência de volumes incompleta':'Sem volumes registrados',
   data.plannedVolumes===null?'Nenhum preparo cadastrado.':
    `Planejado(s): ${data.plannedVolumes}; registrado(s): ${data.registeredVolumes}.`);

 const shipping=data.officialDocuments>0||data.verifiedTrackingEvents>0?
  step('shipping','Transporte','manual_review','Evidências externas cadastradas',
   `${data.officialDocuments} documento(s) e ${data.verifiedTrackingEvents} evento(s) do provedor. Confira a autenticidade e o status individualmente.`) :
  step('shipping','Transporte',
   cancelled?'not_applicable':data.hasManualCarrierTracking?'manual_review':'pending',
   data.hasManualCarrierTracking?'Rastreio informado manualmente':
    cancelled?'Sem expedição oficial documentada':'Sem postagem oficial documentada',
   data.hasManualCarrierTracking?
    'Transportadora e código fornecidos pelo operador; não há validação pelo parceiro.' :
    data.internalRequests?
    'Há preparação interna, mas não há etiqueta, comprovante ou rastreamento oficial.' :
    'Nenhuma etiqueta postal, comprovante ou rastreamento autenticado foi registrado.');

 const notifications=data.failedNotifications>0?
  step('notifications','Comunicação','pending','Falhas de envio',
   `${data.failedNotifications} mensagem(ns) com falha; revise a fila.`) :
  data.pendingNotifications>0?
  step('notifications','Comunicação','pending','Notificações pendentes',
   `${data.pendingNotifications} mensagem(ns) aguardando processamento.`) :
  data.sentNotifications>0?
  step('notifications','Comunicação','complete_internal','Envio registrado',
   `${data.sentNotifications} comunicação(ões) registrada(s) como enviada(s).`) :
  step('notifications','Comunicação','pending','Sem notificações registradas',
   'Não presume que e-mails externos foram enviados.');

 return [items,payment,fiscal,packing,shipping,notifications];
}
export function nextOrderCenterStep(steps:OrderCenterStep[],status:string){
 if(status==='cancelled')return null;
 // A situação do pedido não apaga pendências documentais já existentes.
 const priority:OrderCenterStepId[]=['order','payment','fiscal','packing','shipping','notifications'];
 return priority.map(id=>steps.find(x=>x.id===id))
  .find(x=>x&&x.state==='pending')??null;
}
export const ORDER_CENTER_TONE_LABEL:Record<OrderCenterTone,string>={
 complete_internal:'Registro administrativo',
 manual_review:'Exige conferência',
 pending:'Pendente',
 not_applicable:'Não aplicável'
};
