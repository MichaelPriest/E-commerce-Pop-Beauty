export type ServiceConversationMessage={
 id:string;request_id:string;author_id:string|null;
 author_role:'customer'|'staff';body:string;created_at:string;
};
export function validateServiceMessage(value:unknown,staff:boolean):string|null{
 if(typeof value!=='string')return 'Escreva sua mensagem.';
 const length=value.trim().length;
 const minimum=staff?10:5,maximum=staff?1200:2000;
 if(length<minimum||length>maximum)
  return `A mensagem deve conter entre ${minimum} e ${maximum} caracteres.`;
 return null;
}
export function serviceConversationLabel(role:ServiceConversationMessage['author_role']){
 return role==='staff'?'Equipe Popê Beauty':'Cliente';
}
export function canReplyToService(status:string){
 return status==='open'||status==='in_review'||status==='resolved';
}
