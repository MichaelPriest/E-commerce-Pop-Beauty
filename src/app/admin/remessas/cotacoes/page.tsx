import Link from 'next/link';
import {ArrowLeft,History,ShieldCheck,Package,Clock3} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {formatBRL} from '@/lib/products';
import {sandboxQuoteReferenceStatus,SANDBOX_QUOTE_STATUS_LABELS}
 from '@/lib/shipping/quote-history';

export const dynamic='force-dynamic';
export const metadata={title:'Histórico de cotações sandbox | Popê Beauty'};
export default async function ShippingQuoteHistoryPage(){
 const sb=await requireAdmin();
 const {data,error}=await sb.from('shipment_sandbox_quote_snapshots')
  .select('id,order_id,intent_key,carrier_name,service_name,service_id,price_cents,delivery_days,quoted_at,reference_expires_at')
  .order('quoted_at',{ascending:false}).limit(120);
 if(error)throw new Error('Falha ao consultar histórico de cotações de teste.');
 const rows=data??[];
 const orderIds=[...new Set(rows.map(q=>q.order_id))];
 const {data:intents,error:intentError}=orderIds.length?
  await sb.from('internal_label_intents').select('order_id,intent_key').in('order_id',orderIds):
  {data:[],error:null};
 if(intentError)throw new Error('Falha ao conferir versões das intenções.');
 const versions=new Map((intents??[]).map(v=>[v.order_id,v.intent_key]));
 const now=Date.now();
 const statuses=rows.map(q=>sandboxQuoteReferenceStatus(
  q.intent_key,q.reference_expires_at,versions.get(q.order_id)??null,now
 ));
 const windows=statuses.filter(s=>s==='reference_window').length;
 const expired=statuses.filter(s=>s==='expired').length;
 const replaced=statuses.filter(s=>s==='intent_replaced').length;
 return <div className="container admin-workspace">
  <div className="admin-top"><div>
   <div className="section-kicker">LOGÍSTICA • HOMOLOGAÇÃO</div>
   <h1><History size={28}/> Histórico de cotações</h1>
   <p>Consultas efetuadas na sandbox do Melhor Envio, sem validade comercial.</p>
  </div><Link href="/admin/remessas" className="admin-outline">
   <ArrowLeft size={16}/> Central de Remessas</Link></div>
  <div className="admin-metric-row">
   <div><History/><small>Últimas consultas</small><strong>{rows.length}</strong></div>
   <div><Clock3/><small>Em janela de referência</small><strong>{windows}</strong></div>
   <div><Package/><small>Referência vencida</small><strong>{expired}</strong></div>
   <div><ShieldCheck/><small>Intenção substituída</small><strong>{replaced}</strong></div>
  </div>
  <p className="ops-info"><ShieldCheck size={17}/>
   O prazo de 15 minutos é uma política interna de apresentação, não promessa da
   transportadora. Mesmo cotações dentro dessa janela podem estar desatualizadas
   após alterações no pedido. Nenhum preço é usado no checkout; não existem
   compras, etiquetas oficiais ou rastreamentos neste módulo.</p>
  <div className="ops-table-scroll"><table className="ops-table">
   <thead><tr><th>Consulta</th><th>Pedido</th><th>Serviço sandbox</th>
    <th>Valor teste</th><th>Prazo teste</th><th>Referência</th><th>Ação</th></tr></thead>
   <tbody>{rows.map((q,i)=><tr key={q.id}>
    <td><strong>{new Date(q.quoted_at).toLocaleString('pt-BR')}</strong>
     <small>#{q.id.slice(0,8).toUpperCase()}</small></td>
    <td>#{q.order_id.slice(0,8).toUpperCase()}</td>
    <td><strong>{q.carrier_name}</strong><small>{q.service_name} · {q.service_id}</small></td>
    <td>{formatBRL(q.price_cents)}</td>
    <td>{q.delivery_days} dias</td>
    <td>{SANDBOX_QUOTE_STATUS_LABELS[statuses[i]]}
     <small>Até {new Date(q.reference_expires_at).toLocaleString('pt-BR')}</small></td>
    <td><Link className="ops-small" href={'/admin/logistica/volumes/'+q.order_id}>
     Conferir pedido</Link></td>
   </tr>)}</tbody>
  </table>
  {!rows.length?<div className="admin-empty">
   <History size={32}/><h3>Ainda não há cotações registradas</h3>
   <p>As consultas realizadas após configurar o token sandbox aparecerão aqui.</p>
  </div>:null}</div>
  {rows.length===120?<p className="admin-help">
   Exibindo as 120 consultas mais recentes. Registros anteriores continuam armazenados.</p>:null}
 </div>;
}
