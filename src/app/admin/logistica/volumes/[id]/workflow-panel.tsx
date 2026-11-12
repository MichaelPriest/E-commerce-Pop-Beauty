'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {createClient} from '@/lib/supabase/browser';
import {ClipboardCheck,ClipboardList,ShieldAlert,PackageCheck} from 'lucide-react';
import {INTERNAL_EVENT_LABELS,REQUEST_STATUS_LABELS,
 type InternalEventType,type InternalRequestStatus} from '@/lib/shipping/internal-workflow';

export type WorkflowRequestRow={
 id:string;intent_key:string;request_key:string;provider:string;
 status:InternalRequestStatus;created_at:string;voided_at:string|null
};
export type WorkflowEventRow={
 id:string;request_id:string;event_type:InternalEventType;created_at:string
};
type Props={
 orderId:string;intentKey:string|null;editable:boolean;
 requests:WorkflowRequestRow[];events:WorkflowEventRow[];
 documentsCount:number;trackingCount:number;
};
const options:{type:InternalEventType;label:string}[]=[
 {type:'address_reviewed',label:'Conferir endereço'},
 {type:'packages_reviewed',label:'Conferir volumes'},
 {type:'fiscal_pending',label:'Registrar pendência fiscal'},
 {type:'carrier_pending',label:'Registrar pendência de transportadora'}
];
export function ShippingWorkflowPanel({
 orderId,intentKey,editable,requests,events,documentsCount,trackingCount
}:Props){
 const router=useRouter();
 const [busy,setBusy]=useState('');
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const current=requests.find(item=>item.intent_key===intentKey);
 async function callRpc(name:'prepare_shipment_workflow_request'|
  'void_internal_shipment_request'|'log_internal_shipment_review',
  args:Record<string,string>,message:string){
  if(busy)return;
  setBusy(name);setError('');setNotice('');
  try{
   const {error:rpcError}=await createClient().rpc(name,args);
   if(rpcError)throw rpcError;
   setNotice(message);
   router.refresh();
  }catch(e){
   setError(e instanceof Error?e.message:'Não foi possível registrar a operação.');
  }finally{setBusy('');}
 }
 function prepare(){
  if(!editable||!intentKey||current)return;
  void callRpc('prepare_shipment_workflow_request',{
   p_order_id:orderId,p_intent_key:intentKey
  },'Solicitação interna registrada. Nenhuma etiqueta ou frete foi contratado.');
 }
 function discard(){
  if(!current||current.status!=='prepared_internal'||busy)return;
  if(!window.confirm(
   'Descartar somente esta preparação interna? Isso NÃO cancela remessas ou etiquetas em transportadoras.'
  ))return;
  void callRpc('void_internal_shipment_request',{p_request_id:current.id},
   'Preparação interna descartada. Não houve cancelamento junto à transportadora.');
 }
 return <section className="ops-form-card">
  <h2><ClipboardList size={20}/> Solicitações, documentos e ocorrências</h2>
  <p className="admin-help">Fluxo de conferência administrativa. As operações abaixo não
   contratam frete, não geram PLP, rastreamento ou documento de postagem oficial.</p>
  <div className="admin-metric-row">
   <div><ClipboardCheck/><small>Solicitações internas</small><strong>{requests.length}</strong></div>
   <div><PackageCheck/><small>Documentos oficiais importados</small>
    <strong>{documentsCount}</strong></div>
   <div><ShieldAlert/><small>Eventos verificados da transportadora</small>
    <strong>{trackingCount}</strong></div>
  </div>
  {current?<p className={current.status==='voided_internal'?'form-error':'form-success'}>
   <strong>{REQUEST_STATUS_LABELS[current.status]}</strong>
   {' · '} Solicitação #{current.request_key.slice(0,8).toUpperCase()}
   {' · '} {new Date(current.created_at).toLocaleString('pt-BR')}
  </p>:<p className="admin-help">
   {intentKey?'Não há solicitação interna para a versão atual da intenção.':
    'Registre primeiro uma intenção interna de etiqueta na seção da transportadora.'}
  </p>}
  <div className="admin-form-footer">
   <button type="button" className="admin-primary" disabled={!editable||!intentKey||Boolean(current)||!!busy}
    onClick={prepare}>{busy==='prepare_shipment_workflow_request'?'Registrando...':
    'Preparar solicitação interna de etiqueta'}</button>
   {current?.status==='prepared_internal'?<button type="button" className="admin-outline"
    disabled={!!busy} onClick={discard}>
    {busy==='void_internal_shipment_request'?'Descartando...':'Descartar preparação interna'}
   </button>:null}
  </div>
  {current?.status==='voided_internal'?<p className="admin-help">
   Esta versão foi descartada. Não é possível reabrir a mesma solicitação;
   alterações legítimas na preparação devem gerar uma nova intenção para revisão.</p>:null}
  {current?.status==='prepared_internal'?<div>
   <h3>Registrar conferência administrativa</h3>
   <div className="admin-adult-controls" style={{flexWrap:'wrap'}}>
    {options.map(item=><button type="button" key={item.type} className="admin-outline"
     disabled={!!busy} onClick={()=>void callRpc('log_internal_shipment_review',{
      p_request_id:current.id,p_review_type:item.type
     },'Conferência registrada no histórico interno.')}>
     {item.label}</button>)}
   </div>
  </div>:null}
  {error?<p className="form-error" role="alert">{error}</p>:null}
  {notice?<p className="form-success" role="status">{notice}</p>:null}
  <h3>Histórico da preparação</h3>
  {events.length?<div className="ops-table-scroll">
   <table className="ops-table">
    <thead><tr><th>Data e hora</th><th>Ocorrência interna</th><th>Solicitação</th></tr></thead>
    <tbody>{events.map(event=><tr key={event.id}>
     <td>{new Date(event.created_at).toLocaleString('pt-BR')}</td>
     <td>{INTERNAL_EVENT_LABELS[event.event_type]??event.event_type}</td>
     <td>#{event.request_id.slice(0,8).toUpperCase()}</td>
    </tr>)}</tbody>
   </table></div>:<p className="admin-help">Nenhuma ocorrência interna registrada neste pedido.</p>}
  {requests.some(r=>r.intent_key!==intentKey)?<p className="admin-help">
   Existem solicitações de versões anteriores da remessa. Elas continuam
   no histórico, mas não podem ser utilizadas para preparar a versão atual.</p>:null}
  <p className="admin-help">O bucket de documentos está privado e sem permissão de upload
   pelo navegador. A inclusão de etiquetas oficiais e eventos de rastreamento só será ativada
   com integração autenticada, verificação do provedor e homologação.</p>
 </section>;
}
