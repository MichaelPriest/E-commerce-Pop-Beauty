/** Estados internos e conferências; nenhum deles confirma postagem. */
export type InternalRequestStatus='prepared_internal'|'voided_internal';
export type InternalEventType=
 'request_prepared'|'request_voided'|'address_reviewed'|'packages_reviewed'|
 'fiscal_pending'|'carrier_pending';
export const REQUEST_STATUS_LABELS:Record<InternalRequestStatus,string>={
 prepared_internal:'Preparação interna',
 voided_internal:'Descartada internamente'
};
export const INTERNAL_EVENT_LABELS:Record<InternalEventType,string>={
 request_prepared:'Solicitação interna criada',
 request_voided:'Preparação interna descartada',
 address_reviewed:'Endereço conferido',
 packages_reviewed:'Volumes conferidos',
 fiscal_pending:'Pendência de documentação fiscal',
 carrier_pending:'Pendência de transportadora'
};
export const ALLOWED_INTERNAL_REVIEWS:readonly InternalEventType[]=[
 'address_reviewed','packages_reviewed','fiscal_pending','carrier_pending'
];
