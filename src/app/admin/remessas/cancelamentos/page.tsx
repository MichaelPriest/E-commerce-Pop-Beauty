import Link from 'next/link';
import {ArrowLeft,ShieldAlert,ClipboardList,ShieldCheck} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';

export const dynamic='force-dynamic';
export const metadata={title:'Revisões de cancelamento | Popê Beauty'};
const reasons:Record<string,string>={
 customer_request:'Solicitação do cliente',
 address_correction:'Correção de endereço',
 carrier_problem:'Ocorrência da transportadora',
 duplicate_request:'Solicitação duplicada',
 other:'Outro'
};
export default async function CancellationReviewsPage(){
 const sb=await requireAdmin();
 const {data,error}=await sb.from('shipment_cancellation_reviews')
  .select('id,order_id,request_id,reason_code,status,requested_at,dismissed_at')
  .order('requested_at',{ascending:false}).limit(100);
 if(error)throw new Error('Não foi possível consultar revisões internas.');
 const rows=data??[];
 const pending=rows.filter(r=>r.status==='pending_internal_review').length;
 return <div className="container admin-workspace">
  <div className="admin-top"><div>
   <div className="section-kicker">LOGÍSTICA • CONFERÊNCIA</div>
   <h1><ShieldAlert size={28}/> Revisões de cancelamento</h1>
   <p>Controle administrativo de análise, sem execução no provedor.</p>
  </div><Link className="admin-outline" href="/admin/remessas">
   <ArrowLeft size={16}/> Central de remessas</Link></div>
  <div className="admin-metric-row">
   <div><ClipboardList/><small>Últimas revisões</small><strong>{rows.length}</strong></div>
   <div><ShieldAlert/><small>Pendentes de análise</small><strong>{pending}</strong></div>
   <div><ShieldCheck/><small>Encerradas internamente</small>
    <strong>{rows.length-pending}</strong></div>
  </div>
  <p className="ops-info"><ShieldAlert size={18}/> Nenhuma revisão cancela
   frete, etiqueta, postagem ou pagamento. O registro só pode ser aberto depois
   de haver documento ou evento oficial na solicitação. Cancelamentos externos
   dependerão de integração homologada e confirmação explícita do provedor.</p>
  <div className="ops-table-scroll"><table className="ops-table">
   <thead><tr><th>Revisão</th><th>Pedido</th><th>Solicitação interna</th>
    <th>Motivo</th><th>Situação</th><th>Conferência</th></tr></thead>
   <tbody>{rows.map(review=><tr key={review.id}>
    <td><strong>#{review.id.slice(0,8).toUpperCase()}</strong>
     <small>{new Date(review.requested_at).toLocaleString('pt-BR')}</small></td>
    <td>#{review.order_id.slice(0,8).toUpperCase()}</td>
    <td>#{review.request_id.slice(0,8).toUpperCase()}</td>
    <td>{reasons[review.reason_code]??'Revisão'}</td>
    <td>{review.status==='pending_internal_review'?'Pendente de análise':
     'Encerrada internamente'}</td>
    <td><Link className="ops-small primary"
     href={'/admin/logistica/volumes/'+review.order_id}>Abrir pedido</Link></td>
   </tr>)}</tbody>
  </table>
  {!rows.length?<div className="admin-empty"><ClipboardList size={32}/>
   <h3>Nenhuma revisão de cancelamento</h3>
   <p>As análises serão registradas quando houver evidências oficiais de transporte.</p>
  </div>:null}</div>
  {rows.length===100?<p className="admin-help">Exibindo as 100 revisões mais recentes.</p>:null}
 </div>;
}
