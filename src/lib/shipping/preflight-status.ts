/** Estados de auditoria do preparo. Nenhum autoriza compras de frete. */
export type PreflightStatus=
 'request_voided'|'intent_replaced'|'missing_review'|
 'review_incomplete'|'complete_internal';
export type GuardStatus='not_registered'|'obsolete'|'blocked_homologation';

type RequestData={
 id:string;status:string;intent_key:string;source_fingerprint:string
};
type ReviewData={
 request_id:string;intent_key:string;source_fingerprint:string;
 review_key:string;checklist_complete_internal:boolean
};
type GuardData={
 request_id:string;intent_key:string;source_fingerprint:string;
 preflight_review_key:string;status:string
};
export function classifyPreflight(
 request:RequestData,
 currentIntent:{intent_key:string;source_fingerprint:string}|null,
 review:ReviewData|null
):PreflightStatus{
 if(request.status!=='prepared_internal')return 'request_voided';
 if(!currentIntent||currentIntent.intent_key!==request.intent_key||
    currentIntent.source_fingerprint!==request.source_fingerprint)
  return 'intent_replaced';
 if(!review)return 'missing_review';
 if(review.request_id!==request.id||review.intent_key!==request.intent_key||
    review.source_fingerprint!==request.source_fingerprint)
  return 'intent_replaced';
 return review.checklist_complete_internal?'complete_internal':'review_incomplete';
}
export function classifyPurchaseGuard(
 request:RequestData,currentIntent:{intent_key:string;source_fingerprint:string}|null,
 review:ReviewData|null,guard:GuardData|null
):GuardStatus{
 if(!guard)return 'not_registered';
 if(classifyPreflight(request,currentIntent,review)!=='complete_internal'
    ||guard.request_id!==request.id||guard.intent_key!==request.intent_key
    ||guard.source_fingerprint!==request.source_fingerprint
    ||guard.preflight_review_key!==review?.review_key
    ||guard.status!=='blocked_homologation')return 'obsolete';
 return 'blocked_homologation';
}
export const PREFLIGHT_LABELS:Record<PreflightStatus,string>={
 request_voided:'Preparação interna descartada',
 intent_replaced:'Versão substituída; exige nova conferência',
 missing_review:'Checklist não iniciado',
 review_incomplete:'Checklist em conferência',
 complete_internal:'Conferência interna concluída — sem compra'
};
export const GUARD_LABELS:Record<GuardStatus,string>={
 not_registered:'Chave técnica não registrada',
 obsolete:'Chave técnica de versão anterior',
 blocked_homologation:'Chave técnica registrada — compra bloqueada'
};
