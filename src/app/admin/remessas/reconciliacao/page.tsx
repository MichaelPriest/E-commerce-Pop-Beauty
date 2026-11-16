import Link from 'next/link';
import {ArrowLeft,ClipboardList,ShieldAlert,ShieldCheck,History} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {
 PLAN_STATE_LABELS,PLAN_REVIEW_REASONS,type OperationPlanState
} from '@/lib/shipping/provider-reconciliation';

export const dynamic='force-dynamic';
export const metadata={title:'Reconciliação logística | Popê Beauty'};

export default async function ShippingReconciliationPage(){
 const sb=await requireAdmin();
 const {data:plans,error}=await sb.from('shipment_provider_operation_plans')
  .select('id,order_id,request_id,guard_key,provider,state,review_reason,review_notes,external_dispatch_count,created_at,updated_at')
  .order('updated_at',{ascending:false}).limit(100);
 if(error)throw new Error('Não foi possível carregar os planos de reconciliação.');
 const rows=plans??[];
 const ids=rows.map(x=>x.id);
 const {data:events,error:eventError}=ids.length?
  await sb.from('shipment_operation_plan_events')
   .select('id,plan_id,event_type,event_reason,occurred_at')
   .in('plan_id',ids).order('occurred_at',{ascending:false}).limit(200):
  {data:[],error:null};
 if(eventError)throw new Error('Não foi possível consultar a auditoria de reconciliação.');
 const pending=rows.filter(x=>x.state==='internal_review_required').length;
 const blocked=rows.filter(x=>x.state==='blocked_no_dispatch').length;
 const archived=rows.filter(x=>x.state==='archived_internal').length;
 return <div className="container admin-workspace">
  <div className="admin-top"><div>
   <div className="section-kicker">POPÊ BEAUTY • EXPEDIÇÃO</div>
   <h1><ClipboardList size={28}/> Reconciliação de fretes</h1>
   <p>Planos técnicos de preparação e revisão, sem solicitações externas.</p>
  </div><Link className="admin-outline" href="/admin/remessas">
   <ArrowLeft size={16}/> Central de Remessas</Link></div>
  <div className="admin-metric-row">
   <div><History/><small>Planos internos</small><strong>{rows.length}</strong></div>
   <div><ShieldAlert/><small>Revisão pendente</small><strong>{pending}</strong></div>
   <div><ShieldCheck/><small>Bloqueados, sem despacho</small><strong>{blocked}</strong></div>
   <div><ClipboardList/><small>Arquivados internamente</small><strong>{archived}</strong></div>
  </div>
  <p className="ops-info"><ShieldAlert size={18}/>
   Esta fila não lista compras ou tentativas reais de transportadora.
   <strong> Nenhum plano aciona APIs externas:</strong> chamadas enviadas = 0 por regra do
   banco. Em uma futura integração, qualquer timeout exigirá consulta autenticada
   e conciliação antes de uma nova tentativa — sem retry automático.</p>
  <section className="ops-form-card">
   <h2>Planos e análise de risco</h2>
   {rows.length?<div className="ops-table-scroll"><table className="ops-table">
    <thead><tr><th>Pedido</th><th>Plano</th><th>Prestador selecionado</th>
     <th>Situação interna</th><th>Motivo</th><th>Atualizado</th><th>Detalhes</th></tr></thead>
    <tbody>{rows.map(plan=><tr key={plan.id}>
     <td><strong>#{plan.order_id.slice(0,8).toUpperCase()}</strong></td>
     <td>#{plan.id.slice(0,8).toUpperCase()}</td>
     <td>{plan.provider==='melhor_envio'?'Melhor Envio':'Correios'}</td>
     <td>{PLAN_STATE_LABELS[plan.state as OperationPlanState]??plan.state}
      <small>{plan.external_dispatch_count} chamadas externas</small></td>
     <td>{plan.review_reason?
      PLAN_REVIEW_REASONS[plan.review_reason]??plan.review_reason:'Nenhuma revisão aberta'}</td>
     <td>{new Date(plan.updated_at).toLocaleString('pt-BR')}</td>
     <td><Link href={'/admin/logistica/volumes/'+plan.order_id}
      className="ops-small primary">Conferir</Link></td>
    </tr>)}</tbody>
   </table></div>:<div className="admin-empty">
    <ClipboardList size={32}/><h3>Nenhum plano registrado</h3>
    <p>Após registrar a solicitação, checklist e chave interna de um pedido,
     o administrador poderá preparar uma revisão técnica sem contratar frete.</p>
   </div>}
  </section>
  <section className="ops-form-card">
   <h2>Auditoria de revisões internas</h2>
   {(events??[]).length?<div className="ops-table-scroll"><table className="ops-table">
    <thead><tr><th>Registro</th><th>Plano</th><th>Motivo</th><th>Data</th></tr></thead>
    <tbody>{(events??[]).map(item=><tr key={item.id}>
     <td>{item.event_type==='plan_created_internal'?'Plano criado sem envio':
      item.event_type==='review_requested_internal'?'Revisão administrativa':
      'Arquivamento interno'}</td>
     <td>#{item.plan_id.slice(0,8).toUpperCase()}</td>
     <td>{item.event_reason?
      PLAN_REVIEW_REASONS[item.event_reason]??item.event_reason:'—'}</td>
     <td>{new Date(item.occurred_at).toLocaleString('pt-BR')}</td>
    </tr>)}</tbody>
   </table></div>:<p className="admin-help">Nenhuma ação de reconciliação registrada.</p>}
  </section>
  {rows.length===100?<p className="admin-help">Mostrando os 100 planos mais recentes;
   as entradas anteriores permanecem no banco.</p>:null}
 </div>;
}
