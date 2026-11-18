'use client';
import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {CheckCircle2,MessageCircle,Send,ShieldCheck,AlertCircle} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {dateTimeBR} from '@/types/operations';
import {SERVICE_CATEGORIES,serviceStatusLabel,type ServiceRequest} from '@/lib/customer-service';
import {
 validateServiceMessage,serviceConversationLabel,canReplyToService,
 type ServiceConversationMessage
} from '@/lib/customer-service-conversation';

export function SupportConversation({request,messages,staff,hasMore=false}:{
 request:ServiceRequest;messages:ServiceConversationMessage[];
 staff:boolean;hasMore?:boolean;
}){
 const router=useRouter();
 const [body,setBody]=useState(''),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const allowed=canReplyToService(request.status);
 // Mensagens antigas podem ter sido registradas apenas em admin_note;
 // uma mensagem nova da equipe também atualiza essa coluna por compatibilidade.
 const legacyReply=request.admin_note&&!messages.some(
  msg=>msg.author_role==='staff'&&msg.body===request.admin_note);
 async function send(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(busy||!allowed)return;
  const issue=validateServiceMessage(body,staff);
  if(issue){setError(issue);return;}
  setBusy(true);setError('');setNotice('');
  try{
   const {error:dbError}=await createClient().rpc('post_service_message',{
    p_request_id:request.id,p_body:body.trim()
   });
   if(dbError){
    if(dbError.message.includes('Limite de mensagens'))throw new Error(
     'Você atingiu o limite de mensagens por hora. Tente novamente mais tarde.');
    if(dbError.message.includes('encerrado'))throw new Error(
     'Este atendimento foi encerrado. Abra uma nova solicitação para continuar.');
    throw new Error('Não foi possível enviar a mensagem. Atualize a página e tente novamente.');
   }
   setBody('');
   setNotice(staff?'Resposta registrada. O cliente já pode consultar a conversa.':
    'Mensagem enviada. A equipe poderá continuar o atendimento.');
   router.refresh();
  }catch(e){
   setError(e instanceof Error?e.message:'Falha ao enviar mensagem.');
  }finally{setBusy(false);}
 }
 return <section className="pope-support-conversation" aria-label="Conversa do atendimento">
  <div className="pope-support-conversation-intro">
   <div><small>{SERVICE_CATEGORIES[request.category]} · #{request.id.slice(0,8).toUpperCase()}</small>
    <h2>{request.subject}</h2><small>Solicitação aberta em {dateTimeBR(request.created_at)}</small></div>
   <span className="order-status" data-status={request.status}>
    {serviceStatusLabel(request.status)}</span>
  </div>
  {hasMore?<p className="pope-support-conversation-notice" role="status">
   Conversa longa: exibindo as últimas 100 mensagens. As mais antigas não aparecem nesta página.
  </p>:null}
  <ol className="pope-support-thread">
   <li className="pope-support-thread-message from-customer">
    <div><strong>Cliente · solicitação inicial</strong>
     <time dateTime={request.created_at}>{dateTimeBR(request.created_at)}</time></div>
    <p>{request.description}</p>
   </li>
   {legacyReply?<li className="pope-support-thread-message from-staff">
    <div><strong>Equipe Popê Beauty · resposta anterior</strong></div>
    <p>{request.admin_note}</p>
   </li>:null}
   {messages.map(message=><li className={'pope-support-thread-message from-'+message.author_role}
    key={message.id}>
    <div><strong>{serviceConversationLabel(message.author_role)}</strong>
     <time dateTime={message.created_at}>{dateTimeBR(message.created_at)}</time></div>
    <p>{message.body}</p>
   </li>)}
  </ol>
  {!allowed?<div className="pope-support-conversation-closed">
   <AlertCircle size={18}/><p>Atendimento encerrado. Para uma nova situação,
    abra outra solicitação no pós-venda.</p>
  </div>:<form className="pope-support-conversation-form" onSubmit={send}>
   <h3><MessageCircle size={19}/> {staff?'Responder cliente':'Continuar a conversa'}</h3>
   <label htmlFor="support-conversation-message">
    {staff?'Resposta da equipe':'Sua mensagem'}
   </label>
   <textarea id="support-conversation-message" rows={5} value={body} disabled={busy}
    minLength={staff?10:5} maxLength={staff?1200:2000} required
    placeholder={staff?'Informe os próximos passos e a orientação da equipe.':
     'Conte o que aconteceu ou responda à orientação recebida.'}
    onChange={e=>setBody(e.target.value)}/>
   <p className="pope-support-privacy"><ShieldCheck size={16}/>
    {staff?'A resposta fica visível ao cliente e marca o atendimento como respondido.':
     'Ao responder a um atendimento já atendido, ele volta para a fila da equipe.'}
    {' '}Não inclua senhas ou dados completos de cartão.</p>
   {error?<p className="form-error" role="alert">{error}</p>:null}
   {notice?<p className="form-success" role="status"><CheckCircle2 size={16}/>{notice}</p>:null}
   <button type="submit" className="admin-primary" disabled={busy}>
    <Send size={17}/>{busy?'Enviando...':'Enviar mensagem'}
   </button>
  </form>}
 </section>;
}
