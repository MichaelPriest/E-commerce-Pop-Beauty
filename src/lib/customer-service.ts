/** Atendimento do cliente; não movimenta caixa, pedido ou estoque. */
export const SERVICE_CATEGORIES={
 troca:'Troca de produto',
 devolucao:'Devolução',
 entrega:'Entrega e rastreamento',
 produto:'Problema com produto',
 outro:'Outras dúvidas'
} as const;
export const SERVICE_STATUSES={
 open:'Recebida',
 in_review:'Em análise',
 resolved:'Respondida',
 closed:'Encerrada'
} as const;
export type ServiceCategory=keyof typeof SERVICE_CATEGORIES;
export type ServiceStatus=keyof typeof SERVICE_STATUSES;
export type ServiceRequest={
 id:string;user_id:string;order_id:string|null;
 category:ServiceCategory;subject:string;description:string;
 status:ServiceStatus;admin_note:string|null;reviewed_by:string|null;
 created_at:string;updated_at:string;
};
export function validateServiceRequest(
 category:unknown,subject:unknown,description:unknown
):string|null{
 if(typeof category!=='string'||!(category in SERVICE_CATEGORIES))
  return 'Selecione o motivo do atendimento.';
 if(typeof subject!=='string'||subject.trim().length<5||subject.trim().length>120)
  return 'Informe um assunto entre 5 e 120 caracteres.';
 if(typeof description!=='string'||description.trim().length<20||
  description.trim().length>2000)
  return 'Descreva sua solicitação com 20 a 2.000 caracteres.';
 return null;
}
export function serviceStatusLabel(status:string){
 return status in SERVICE_STATUSES?
  SERVICE_STATUSES[status as ServiceStatus]:'Status desconhecido';
}
