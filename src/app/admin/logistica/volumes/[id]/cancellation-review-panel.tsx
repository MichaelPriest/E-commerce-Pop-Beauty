'use client';
import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {ClipboardList,ShieldAlert} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';

export type CancellationReviewRow={
 id:string;request_id:string;reason_code:string;status:string;
 requested_at:string;dismissed_at:string|null;
};
type Props={
 requestId:string|null;hasProviderEvidence:boolean;
 reviews:CancellationReviewRow[];
};
const reasons=[
 {value:'customer_request',label:'Solicitação do cliente'},
 {value:'address_correction',label:'Correção de endereço'},
 {value:'carrier_problem',label:'Ocorrência da transportadora'},
 {value:'duplicate_request',label:'Suspeita de solicitação duplicada'},
 {value:'other',label:'Outro motivo de conferência'}
];
export function CancellationReviewPanel({requestId,hasProviderEvidence,reviews}:Props){
 const router=useRouter();
 const [reason,setReason]=useState('customer_request');
 const [notes,setNotes]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState(''),[error,setError]=useState('');
 const existing=reviews.find(x=>x.request_id===requestId);
 const canOpen=Boolean(requestId&&hasProviderEvidence&&!existing);
 async function openReview(event:FormEvent){
  event.preventDefault();
  if(!canOpen||busy)return;
  setBusy(true);setError('');setMessage('');
  try{
   const {error:rpcError}=await createClient().rpc('open_shipment_cancellation_review',{
    p_request_id:requestId,p_reason_code:reason,p_review_notes:notes.trim()||null
   });
   if(rpcError)throw rpcError;
   setMessage('Revisão administrativa registrada. Nenhuma ordem de cancelamento foi enviada.');
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível abrir revisão.');}
  finally{setBusy(false);}
 }
 async function dismiss(){
  if(!existing||existing.status!=='pending_internal_review'||busy)return;
  if(!window.confirm(
   'Encerrar somente a revisão interna? Esta ação NÃO cancela etiquetas, postagens nem pagamentos.'
  ))return;
  setBusy(true);setError('');setMessage('');
  try{
   const {error:rpcError}=await createClient().rpc('dismiss_shipment_cancellation_review',{
    p_review_id:existing.id
   });
   if(rpcError)throw rpcError;
   setMessage('Revisão interna encerrada. Nenhuma ação foi executada na transportadora.');
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível encerrar a revisão.');}
  finally{setBusy(false);}
 }
 return <section className="ops-form-card">
  <h2><ShieldAlert size={20}/> Revisão de cancelamento de frete</h2>
  <p className="admin-help">Esta área gera apenas uma solicitação administrativa de
   conferência. Não cancela remessas, compras, etiquetas ou pedidos e não solicita
   estorno. O contato ou integração com a transportadora permanece pendente.</p>
  {existing?<div>
   <p className={existing.status==='pending_internal_review'?'form-error':'admin-help'}>
    {existing.status==='pending_internal_review'?'Revisão interna pendente':
     'Revisão encerrada internamente'}
    {' · '} Protocolo #{existing.id.slice(0,8).toUpperCase()}
    {' · '} {new Date(existing.requested_at).toLocaleString('pt-BR')}
   </p>
   {existing.status==='pending_internal_review'?<button type="button" className="admin-outline"
    disabled={busy} onClick={()=>void dismiss()}>
    {busy?'Registrando...':'Encerrar revisão interna (sem cancelar frete)'}</button>:null}
  </div>:<form className="admin-form" onSubmit={openReview}>
   <div className="admin-form-grid">
    <label>Motivo da revisão
     <select value={reason} onChange={e=>setReason(e.target.value)}
      disabled={!canOpen||busy}>
      {reasons.map(item=><option key={item.value} value={item.value}>
       {item.label}</option>)}
     </select>
    </label>
    <label className="full">Observação operacional (opcional, sem dados pessoais)
     <textarea maxLength={300} rows={2} value={notes}
      disabled={!canOpen||busy} onChange={e=>setNotes(e.target.value)}
      placeholder="Detalhes para a análise interna, sem CPF, telefone ou endereço"/>
    </label>
   </div>
   <div className="admin-form-footer">
    <button className="admin-outline" type="submit" disabled={!canOpen||busy}>
     <ClipboardList size={17}/>
     {busy?'Registrando...':'Abrir revisão interna de cancelamento'}</button>
   </div>
   {!requestId?<p className="admin-help">Prepare a solicitação interna da versão atual
    antes de abrir uma revisão.</p>:null}
   {requestId&&!hasProviderEvidence?<p className="admin-help">
    Bloqueado: não existe documento ou evento oficial do provedor associado a esta
    solicitação. Uma simples intenção interna não caracteriza frete comprado.</p>:null}
  </form>}
  {error?<p className="form-error" role="alert">{error}</p>:null}
  {message?<p className="form-success" role="status">{message}</p>:null}
  {reviews.length>1?<p className="admin-help">Existem {reviews.length} revisões históricas
   de outras versões da solicitação, preservadas para auditoria.</p>:null}
 </section>;
}
