'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {ClipboardList,ShieldAlert,ShieldCheck} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {PLAN_REVIEW_REASONS,PLAN_STATE_LABELS,
 type OperationPlanState} from '@/lib/shipping/provider-reconciliation';

export type OperationPlanRow={
 id:string;request_id:string;order_id:string;guard_key:string;
 preflight_review_key:string;source_fingerprint:string;provider:string;
 state:OperationPlanState;review_reason:string|null;review_notes:string|null;
 external_dispatch_count:number;created_at:string;updated_at:string
};
export type OperationPlanEventRow={
 id:string;plan_id:string;event_type:string;event_reason:string|null;
 occurred_at:string;external_request_performed:boolean
};
type Props={
 requestId:string|null;guardKey:string|null;guardCurrent:boolean;
 editable:boolean;plan:OperationPlanRow|null;events:OperationPlanEventRow[];
};
export function ShippingOperationPlanPanel({
 requestId,guardKey,guardCurrent,editable,plan,events
}:Props){
 const router=useRouter();
 const [reason,setReason]=useState('integration_pending');
 const [notes,setNotes]=useState('');
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function run(name:'stage_shipment_provider_operation_plan'|
   'review_shipment_provider_operation_plan'|
   'archive_shipment_provider_operation_plan',args:Record<string,string|null>,
   success:string){
  if(busy)return;
  setBusy(name);setError('');setNotice('');
  try{
   const {data,error:rpcError}=await createClient().rpc(name,args);
   if(rpcError)throw rpcError;
   setNotice(data?.created===false||data?.changed===false?
    'Sem alteração. O registro existente foi preservado.':success);
   router.refresh();
  }catch(e){
   setError(e instanceof Error?e.message:'Não foi possível registrar a conferência.');
  }finally{setBusy('');}
 }
 function stage(){
  if(!editable||!requestId||!guardKey||!guardCurrent||plan||busy)return;
  void run('stage_shipment_provider_operation_plan',{
   p_request_id:requestId,p_guard_key:guardKey
  },'Plano de reconciliação interna registrado. Nenhum frete foi comprado.');
 }
 function review(){
  if(!plan||plan.state==='archived_internal'||busy)return;
  void run('review_shipment_provider_operation_plan',{
   p_plan_id:plan.id,p_reason:reason,p_notes:notes.trim()||null
  },'Revisão de risco registrada, sem contato com transportadora.');
 }
 function archive(){
  if(!plan||plan.state!=='internal_review_required'||busy)return;
  if(!window.confirm('Arquivar esta revisão administrativa? Isso NÃO autoriza nova compra, reenvio ou estorno.'))return;
  void run('archive_shipment_provider_operation_plan',{
   p_plan_id:plan.id
  },'Registro arquivado sem envio ao provedor.');
 }
 return <section className="ops-form-card">
  <h2><ClipboardList size={20}/> Plano de operação e reconciliação</h2>
  <p className="admin-help">Esta etapa prepara a investigação de respostas ambíguas
   e falhas futuras. <strong>Nenhuma chamada de compra, cancelamento, rastreio ou consulta
   comercial ao provedor é realizada.</strong></p>
  <div className="admin-metric-row">
   <div><ShieldCheck/><small>Plano atual</small>
    <strong>{plan?PLAN_STATE_LABELS[plan.state]:'Não registrado'}</strong></div>
   <div><ShieldAlert/><small>Despachos externos</small><strong>0</strong></div>
  </div>
  {plan?<p className="admin-help">
   Plano #{plan.id.slice(0,8).toUpperCase()} · Integrador:
   {' '}{plan.provider==='melhor_envio'?'Melhor Envio':'Correios'}
   {' · '} Criado em {new Date(plan.created_at).toLocaleString('pt-BR')}
   {' · '} {plan.external_dispatch_count} solicitações externas
  </p>:null}
  {!plan?<div className="admin-form-footer">
   <button type="button" className="admin-outline"
    disabled={!editable||!requestId||!guardKey||!guardCurrent||!!busy}
    onClick={stage}>
    {busy?'Registrando...':'Registrar plano interno (sem compra)'}</button>
  </div>:null}
  {!guardCurrent&&!plan?<p className="admin-help">Registre primeiro o checklist completo
   e a chave técnica vigente para esta solicitação.</p>:null}
  {plan?.state!=='archived_internal'&&plan?<div className="admin-form">
   <h3>Revisão de risco operacional</h3>
   <p className="admin-help">Registrar risco de timeout não afirma que um timeout ocorreu.
    A investigação real deverá exigir referências autenticadas do provedor.</p>
   <label>Motivo preventivo
    <select value={reason} onChange={e=>setReason(e.target.value)} disabled={!!busy}>
     {Object.entries(PLAN_REVIEW_REASONS).map(([key,label])=>
      <option key={key} value={key}>{label}</option>)}
    </select>
   </label>
   <label>Observações administrativas (sem dados pessoais)
    <textarea rows={2} maxLength={300} value={notes}
     onChange={e=>setNotes(e.target.value)} disabled={!!busy}
     placeholder="Descreva a pendência técnica; não insira CPF, telefone ou endereço"/>
   </label>
   <div className="admin-form-footer">
    <button type="button" className="admin-outline" disabled={!!busy}
     onClick={review}>{busy?'Registrando...':'Registrar revisão interna'}</button>
    {plan.state==='internal_review_required'?<button
     type="button" className="admin-outline" disabled={!!busy}
     onClick={archive}>Arquivar revisão (sem compra)</button>:null}
   </div>
  </div>:null}
  {error?<p className="form-error" role="alert">{error}</p>:null}
  {notice?<p className="form-success" role="status">{notice}</p>:null}
  <h3>Auditoria do plano</h3>
  {events.length?<div className="ops-table-scroll"><table className="ops-table">
   <thead><tr><th>Ocorrência interna</th><th>Data</th><th>Motivo</th></tr></thead>
   <tbody>{events.map(item=><tr key={item.id}>
    <td>{item.event_type==='plan_created_internal'?'Plano criado sem envio':
      item.event_type==='review_requested_internal'?'Revisão solicitada':
      'Revisão arquivada'}</td>
    <td>{new Date(item.occurred_at).toLocaleString('pt-BR')}</td>
    <td>{item.event_reason?PLAN_REVIEW_REASONS[item.event_reason]??item.event_reason:'—'}</td>
   </tr>)}</tbody>
  </table></div>:<p className="admin-help">Nenhuma operação registrada para este plano.</p>}
  <p className="admin-help">Mesmo após arquivamento, a compra continua bloqueada.
   Após qualquer timeout real, uma futura integração deverá consultar o pedido no
   provedor antes de autorizar nova tentativa. <Link href="/admin/remessas/reconciliacao">
   Ver fila consolidada</Link>.</p>
 </section>;
}
