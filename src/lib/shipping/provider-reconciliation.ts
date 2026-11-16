/** Política conservadora para um FUTURO adaptador de compra autenticado.
 * Este módulo não faz rede, não consulta provedor, não autoriza compra ou retry.
 * Ele isola decisões de reconciliação que deverão ser testadas na homologação.
 */
export type ProviderPurchaseObservation=
 |{kind:'never_dispatched'}
 |{kind:'dispatched_timeout'}
 |{kind:'dispatched_unverified_response'}
 |{kind:'verified_purchase_found';providerOrderId:string}
 |{kind:'verified_no_purchase_found';providerLookupId:string};

export type ReconciliationDecision={
 outcome:'not_dispatched'|'unknown_external_state'|
  'verified_external_purchase'|'verified_external_absence';
 action:'keep_blocked'|'manual_reconciliation_required';
 automaticRetryAllowed:false;
 purchaseConfirmed:boolean;
 message:string;
};

export function evaluateProviderPurchaseObservation(
 observation:ProviderPurchaseObservation
):ReconciliationDecision{
 switch(observation.kind){
  case 'never_dispatched':
   return {outcome:'not_dispatched',action:'keep_blocked',
    automaticRetryAllowed:false,purchaseConfirmed:false,
    message:'Nenhuma solicitação foi enviada ao provedor. Compra bloqueada.'};
  case 'dispatched_timeout':
  case 'dispatched_unverified_response':
   return {outcome:'unknown_external_state',action:'manual_reconciliation_required',
    automaticRetryAllowed:false,purchaseConfirmed:false,
    message:'Resultado externo desconhecido. Investigue o pedido diretamente no provedor antes de qualquer nova tentativa.'};
  case 'verified_purchase_found':
   if(!observation.providerOrderId?.trim())
    return {outcome:'unknown_external_state',action:'manual_reconciliation_required',
     automaticRetryAllowed:false,purchaseConfirmed:false,
     message:'Compra sem referência verificada. Não repetir a operação.'};
   return {outcome:'verified_external_purchase',action:'manual_reconciliation_required',
    automaticRetryAllowed:false,purchaseConfirmed:true,
    message:'Compra identificada pelo adaptador verificado. Exige conciliação e registro transacional antes de avançar.'};
  case 'verified_no_purchase_found':
   if(!observation.providerLookupId?.trim())
    return {outcome:'unknown_external_state',action:'manual_reconciliation_required',
     automaticRetryAllowed:false,purchaseConfirmed:false,
     message:'Consulta externa sem evidência suficiente. Não repetir automaticamente.'};
   return {outcome:'verified_external_absence',action:'manual_reconciliation_required',
    automaticRetryAllowed:false,purchaseConfirmed:false,
    message:'Não foi localizada compra na consulta autenticada. Reexamine janela de consistência e idempotência contratual antes de qualquer retry.'};
 }
}
export type OperationPlanState='blocked_no_dispatch'|'internal_review_required'|'archived_internal';
export const PLAN_STATE_LABELS:Record<OperationPlanState,string>={
 blocked_no_dispatch:'Preparado internamente — sem envio',
 internal_review_required:'Revisão administrativa pendente',
 archived_internal:'Arquivado internamente — sem envio'
};
export const PLAN_REVIEW_REASONS:Record<string,string>={
 integration_pending:'Homologação do provedor pendente',
 configuration_review:'Conferência de configuração',
 duplicate_risk:'Análise preventiva de duplicidade',
 timeout_policy_review:'Análise da política de timeout (não é ocorrência real)',
 other:'Outra revisão operacional'
};
