import Link from 'next/link';
import {ArrowLeft,ClipboardCheck,ShieldAlert,ShieldCheck,Truck} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {
 classifyPreflight,classifyPurchaseGuard,PREFLIGHT_LABELS,GUARD_LABELS
} from '@/lib/shipping/preflight-status';

export const dynamic='force-dynamic';
export const metadata={title:'Pré-contratação de frete | Popê Beauty'};
export default async function ShippingPreflightsPage(){
 const sb=await requireAdmin();
 const {data:requests,error:requestError}=await sb.from('shipment_workflow_requests')
  .select('id,order_id,request_key,provider,intent_key,source_fingerprint,status,created_at')
  .order('created_at',{ascending:false}).limit(100);
 if(requestError)throw new Error('Não foi possível carregar solicitações para conferência.');
 const rows=requests??[];
 const requestIds=rows.map(x=>x.id);
 const orderIds=[...new Set(rows.map(x=>x.order_id))];
 const [intents,preflights,guards]=await Promise.all([
  orderIds.length?sb.from('internal_label_intents')
   .select('order_id,intent_key,source_fingerprint').in('order_id',orderIds):
   Promise.resolve({data:[],error:null}),
  requestIds.length?sb.from('shipment_purchase_preflights')
   .select('request_id,intent_key,source_fingerprint,review_key,checklist_complete_internal,reviewed_at')
   .in('request_id',requestIds):Promise.resolve({data:[],error:null}),
  orderIds.length?sb.from('shipment_purchase_guards')
   .select('order_id,request_id,intent_key,source_fingerprint,preflight_review_key,status,guard_key,guard_revision')
   .in('order_id',orderIds):Promise.resolve({data:[],error:null})
 ]);
 if(intents.error||preflights.error||guards.error)
  throw new Error('Não foi possível consultar as verificações e chaves de frete.');
 const intentByOrder=new Map((intents.data??[]).map(x=>[x.order_id,x]));
 const reviewByRequest=new Map((preflights.data??[]).map(x=>[x.request_id,x]));
 const guardByOrder=new Map((guards.data??[]).map(x=>[x.order_id,x]));
 const evaluated=rows.map(request=>{
  const current=intentByOrder.get(request.order_id)??null;
  const review=reviewByRequest.get(request.id)??null;
  const guard=guardByOrder.get(request.order_id)??null;
  return {
   request,review,guard,
   reviewStatus:classifyPreflight(request,current,review),
   guardStatus:classifyPurchaseGuard(request,current,review,guard)
  };
 });
 const completed=evaluated.filter(x=>x.reviewStatus==='complete_internal').length;
 const keys=evaluated.filter(x=>x.guardStatus==='blocked_homologation').length;
 const obsolete=evaluated.filter(x=>x.reviewStatus==='intent_replaced').length;
 return <div className="container admin-workspace">
  <div className="admin-top"><div>
   <div className="section-kicker">POPÊ BEAUTY • PRÉ-EXPEDIÇÃO</div>
   <h1><ClipboardCheck size={28}/> Pré-contratação de frete</h1>
   <p>Conferências humanas e chave técnica de controle, sem compras em transportadoras.</p>
  </div><Link className="admin-outline" href="/admin/remessas">
   <ArrowLeft size={16}/> Central de remessas</Link></div>
  <div className="admin-metric-row">
   <div><Truck/><small>Últimas solicitações</small><strong>{rows.length}</strong></div>
   <div><ClipboardCheck/><small>Checklists internos completos</small><strong>{completed}</strong></div>
   <div><ShieldCheck/><small>Chaves internas vigentes</small><strong>{keys}</strong></div>
   <div><ShieldAlert/><small>Revisões de versão substituída</small><strong>{obsolete}</strong></div>
  </div>
  <p className="ops-info"><ShieldAlert size={17}/> Mesmo com checklist completo
   e chave vigente, <strong>todas as compras de frete estão bloqueadas</strong>.
   Conferências manuais não são documentos fiscais autorizados e nenhuma cotação
   de sandbox é um preço válido para contratação real. A idempotência externa
   dependerá do contrato e dos mecanismos do provedor.</p>
  <div className="ops-table-scroll"><table className="ops-table">
   <thead><tr><th>Solicitação</th><th>Pedido</th><th>Prestador</th>
    <th>Conferência</th><th>Chave técnica</th><th>Operação</th></tr></thead>
   <tbody>{evaluated.map(({request,review,guard,reviewStatus,guardStatus})=>
    <tr key={request.id}>
     <td><strong>#{request.request_key.slice(0,8).toUpperCase()}</strong>
      <small>{new Date(request.created_at).toLocaleString('pt-BR')}</small></td>
     <td>#{request.order_id.slice(0,8).toUpperCase()}</td>
     <td>{request.provider==='melhor_envio'?'Melhor Envio':'Correios'}</td>
     <td>{PREFLIGHT_LABELS[reviewStatus]}
      {review?<small>Revisão #{review.review_key.slice(0,8).toUpperCase()}</small>:null}</td>
     <td>{GUARD_LABELS[guardStatus]}
      {guardStatus==='blocked_homologation'&&guard?
       <small>Chave #{guard.guard_key.slice(0,8).toUpperCase()}</small>:null}</td>
     <td><Link className="ops-small primary"
      href={'/admin/logistica/volumes/'+request.order_id}>Conferir</Link></td>
    </tr>
   )}</tbody>
  </table>
  {!evaluated.length?<div className="admin-empty"><ClipboardCheck size={32}/>
   <h3>Nenhuma solicitação preparada</h3>
   <p>Primeiro registre uma intenção e uma solicitação interna em Logística → Volumes.</p>
  </div>:null}</div>
  {rows.length===100?<p className="admin-help">Exibindo as 100 solicitações recentes,
   sem remover registros antigos.</p>:null}
 </div>;
}
