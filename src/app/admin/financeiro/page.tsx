import Link from 'next/link';
import {CreditCard,Wallet,Clock,CheckCircle2,ShieldAlert,ShoppingBag} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {formatBRL} from '@/lib/products';
import {ORDER_LABELS,dateTimeBR} from '@/types/operations';
export const dynamic='force-dynamic';
export default async function FinancePage(){
 const sb=await requireAdmin();
 const {data,error}=await sb.from('orders')
 .select('id,origin,channel,status,total_cents,created_at,payment_reference')
 .order('created_at',{ascending:false}).limit(500);
 if(error)return <div className="container admin-workspace"><h1>Financeiro</h1><p role="alert" className="form-error">{error.message}</p></div>;
 const orders=data??[];
 const awaiting=orders.filter(o=>o.status==='pending');
 const confirmed=orders.filter(o=>['paid','packing','shipped','delivered'].includes(o.status));
 const cancelled=orders.filter(o=>o.status==='cancelled');
 const confirmedTotal=confirmed.reduce((sum,o)=>sum+o.total_cents,0);
 const pendingTotal=awaiting.reduce((sum,o)=>sum+o.total_cents,0);
 return <div className="container admin-workspace">
  <div className="admin-top"><div><div className="section-kicker">FINANCEIRO • POPÊ BEAUTY</div><h1>Pagamentos e recebimentos 💳</h1><p>Acompanhamento administrativo de pedidos — sem gateway integrado.</p></div><Link href="/admin/pedidos" className="admin-outline"><ShoppingBag size={17}/> Abrir pedidos</Link></div>
  <div className="admin-metric-row"><div><Wallet/><small>Pagamentos registrados manualmente*</small><strong>{formatBRL(confirmedTotal)}</strong></div>
   <div><Clock/><small>Aguardando confirmação</small><strong>{formatBRL(pendingTotal)}</strong></div>
   <div><CheckCircle2/><small>Pedidos confirmados</small><strong>{confirmed.length}</strong></div>
   <div><ShieldAlert/><small>Pedidos cancelados</small><strong>{cancelled.length}</strong></div></div>
  <div className="ops-integration-grid"><div className="ops-integration"><div className="ops-integration-icon">💳</div><h2>Cartão de crédito</h2><p>Provedor não configurado</p><span className="ops-tag status-pending">Indisponível</span></div>
   <div className="ops-integration"><div className="ops-integration-icon">⚡</div><h2>PIX online</h2><p>Provedor não configurado</p><span className="ops-tag status-pending">Indisponível</span></div>
   <div className="ops-integration"><div className="ops-integration-icon">📄</div><h2>Boleto</h2><p>Provedor não configurado</p><span className="ops-tag status-pending">Indisponível</span></div></div>
  <p className="ops-info"><CreditCard size={18}/> *Valores representam pedidos que um administrador marcou manualmente como recebidos. Não são conciliação bancária nem prova de transferência. Não processamos nem guardamos dados de cartão.</p>
  <div className="ops-form-card"><h2>Últimos lançamentos administrativos</h2>
   <div className="ops-table-scroll"><table className="ops-table"><thead><tr><th>Pedido</th><th>Data</th><th>Status</th><th>Valor</th><th>Referência administrativa</th></tr></thead>
    <tbody>{orders.slice(0,80).map(o=><tr key={o.id}><td>#{o.id.slice(0,8).toUpperCase()}</td>
     <td>{dateTimeBR(o.created_at)}</td><td>{ORDER_LABELS[o.status]??o.status}</td><td><strong>{formatBRL(o.total_cents)}</strong></td><td>{o.payment_reference||'Sem confirmação'}</td></tr>)}</tbody></table>
    {orders.length===0?<div className="admin-empty"><Wallet size={32}/><h3>Nenhum pedido registrado</h3></div>:null}
   </div>
  </div>
 </div>;
}
