/** Classificação temporal de referência interna; não indica frete contratável. */
export type SandboxQuoteReferenceStatus='intent_replaced'|'expired'|'reference_window';
export function sandboxQuoteReferenceStatus(
 intentKey:string,referenceExpiresAt:string,currentIntentKey:string|null,
 nowMs:number=Date.now()
):SandboxQuoteReferenceStatus{
 if(!currentIntentKey||intentKey!==currentIntentKey)return 'intent_replaced';
 const time=Date.parse(referenceExpiresAt);
 if(!Number.isFinite(time)||time<=nowMs)return 'expired';
 return 'reference_window';
}
export const SANDBOX_QUOTE_STATUS_LABELS:Record<SandboxQuoteReferenceStatus,string>={
 intent_replaced:'Intenção substituída',
 expired:'Referência vencida',
 reference_window:'Na janela técnica — requer revalidação'
};
