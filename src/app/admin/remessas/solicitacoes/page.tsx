import Link from 'next/link';
import {ArrowLeft,ClipboardList,FileLock2,Route,ShieldCheck} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {REQUEST_STATUS_LABELS,type InternalRequestStatus} from '@/lib/shipping/internal-workflow';

export const dynamic='force-dynamic';
export const metadata={title:'Solicitações de expedição | Popê Beauty'};
export default async function ShipmentRequestsPage(){
 const sb=await requireAdmin();
 const {data,error}=await sb.from('shipment_workflow_requests')
  .select('id,order_id,intent_key,request_key,provider,status,created_at,voided_at')
  .order('created_at',{ascending:false}).limit(100);
 if(error)throw new Error('Falha ao consultar solicitações internas.');
 const rows=data??[];
 const orderIds=[...new Set(rows.map(r=>r.order_id))];
 const requestIds=rows.map(r=>r.id);
 const [versions,documents,tracking]=await Promise.all([
  orderIds.length?sb.from('internal_label_intents').select('order_id,intent_key')
   .in('order_id',orderIds):Promise.resolve({data:[],error:null}),
  requestIds.length?sb.from('shipment_provider_documents').select('request_id')
   .in('request_id',requestIds):Promise.resolve({data:[],error:null}),
  requestIds.length?sb.from('shipment_tracking_provider_events').select('request_id')
   .in('request_id',requestIds):Promise.resolve({data:[],error:null})
 ]);
 if(versions.error||documents.error||tracking.error)
  throw new Error('Não foi possível conferir documentos e eventos das solicitações.');
 const current=new Map((versions.data??[]).map(r=>[r.order_id,r.intent_key]));
 const active=rows.filter(r=>r.status==='prepared_internal').length;
 const discarded=rows.filter(r=>r.status==='voided_internal').length;
 return <div className="container admin-workspace">
  <div className="admin-top"><div>
   <div className="section-kicker">POPÊ BEAUTY • OPERAÇÃO LOGÍSTICA</div>
   <h1><ClipboardList size={28}/> Solicitações de expedição</h1>
   <p>Pedidos preparados internamente, sem compras de frete e sem etiquetas postais.</p>
  </div><Link className="admin-outline" href="/admin/remessas"><ArrowLeft size={17}/>
   Central de Remessas</Link></div>
  <div className="admin-metric-row">
   <div><ClipboardList/><small>Últimas solicitações</small><strong>{rows.length}</strong></div>
   <div><ShieldCheck/><small>Em preparação interna</small><strong>{active}</strong></div>
   <div><FileLock2/><small>Descartadas internamente</small><strong>{discarded}</strong></div>
   <div><Route/><small>Documentos e eventos verificados</small>
    <strong>{(documents.data??[]).length+(tracking.data??[]).length}</strong></div>
  </div>
  <p className="ops-info"><ShieldCheck size={17}/>
   Descartar uma solicitação interna não cancela uma etiqueta ou compra em provedor externo.
   Nesta versão, o Storage é privado e não aceita upload direto pelo navegador.
   Os registros de rastreio de transportadoras somente poderão entrar por integração futura autenticada.</p>
  <div className="ops-table-scroll"><table className="ops-table">
   <thead><tr><th>Solicitação</th><th>Pedido</th><th>Integrador</th>
    <th>Status interno</th><th>Versão</th><th>Documentos</th><th>Operação</th></tr></thead>
   <tbody>{rows.map(r=>{
    const outdated=current.get(r.order_id)!==r.intent_key;
    const docCount=(documents.data??[]).filter(d=>d.request_id===r.id).length;
    return <tr key={r.id}>
     <td><strong>#{r.request_key.slice(0,8).toUpperCase()}</strong>
      <small>{new Date(r.created_at).toLocaleString('pt-BR')}</small></td>
     <td>#{r.order_id.slice(0,8).toUpperCase()}</td>
     <td>{r.provider==='melhor_envio'?'Melhor Envio':'Correios'}</td>
     <td>{REQUEST_STATUS_LABELS[r.status as InternalRequestStatus]??r.status}</td>
     <td>{outdated?'Intenção substituída':'Intenção atual'}</td>
     <td>{docCount} documento(s)</td>
     <td><Link className="ops-small primary"
      href={'/admin/logistica/volumes/'+r.order_id}>Conferir</Link></td>
    </tr>;
   })}</tbody>
  </table>
  {!rows.length?<div className="admin-empty"><ClipboardList size={32}/>
   <h3>Nenhuma solicitação interna registrada</h3>
   <p>Prepare uma intenção na tela de volumes para iniciar a conferência de expedição.</p>
  </div>:null}</div>
  {rows.length===100?<p className="admin-help">
   Exibindo as 100 solicitações mais recentes. Registros anteriores permanecem disponíveis no banco.</p>:null}
 </div>;
}
