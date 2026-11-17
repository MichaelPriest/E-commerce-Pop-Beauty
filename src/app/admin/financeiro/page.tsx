import Link from 'next/link';
import {CreditCard,Wallet,Clock,CheckCircle2,ShieldAlert,ShoppingBag,Settings2} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {formatBRL} from '@/lib/products';
import {COMMERCIAL_PAYMENT_RESULTS,COMMERCIAL_REVIEW_RESULTS,type CommercialPaymentResult} from '@/lib/payments/commercial-payment';
import {ORDER_LABELS,dateTimeBR} from '@/types/operations';
export const dynamic='force-dynamic';
export default async function FinancePage(){
 const sb=await requireAdmin();
 const [{data,error},paymentReviews]=await Promise.all([
  sb.from('orders').select('id,origin,channel,status,total_cents,created_at,payment_reference')
   .neq('origin','store_api').order('created_at',{ascending:false}).limit(500),
  sb.from('commercial_provider_payments')
   .select('payment_id,status,amount_cents,result,observed_at,commercial_payment_checkouts(order_id)')
   .in('result',COMMERCIAL_REVIEW_RESULTS).order('observed_at',{ascending:false}).limit(50)
 ]);
 if(error)return <div className="container admin-workspace"><h1>Financeiro</h1><p role="alert" className="form-error">{error.message}</p></div>;
 const orders=data??[];
 const awaiting=orders.filter(o=>o.status==='pending');
 const confirmed=orders.filter(o=>['paid','packing','shipped','delivered'].includes(o.status));
 const cancelled=orders.filter(o=>o.status==='cancelled');
 const confirmedTotal=confirmed.reduce((sum,o)=>sum+o.total_cents,0);
 const pendingTotal=awaiting.reduce((sum,o)=>sum+o.total_cents,0);
 return <div className="container admin-workspace">
  <div className="admin-top"><div><div className="section-kicker">FINANCEIRO • POPÊ BEAUTY</div><h1>Pagamentos e recebimentos 💳</h1><p>Valores dos pedidos e retornos do provedor para conferência.</p></div><div className="admin-adult-controls"><Link href="/admin/gateways" className="admin-primary"><Settings2 size={17}/> Comparar gateways</Link>
 <Link href="/admin/pagamentos" className="admin-outline"><CreditCard size={17}/> Pagamentos sandbox</Link>
 <Link href="/admin/financeiro/compras" className="admin-outline">Custos de mercadorias</Link>
 <Link href="/admin/pedidos" className="admin-outline"><ShoppingBag size={17}/> Abrir pedidos</Link></div></div>
  <div className="admin-metric-row"><div><Wallet/><small>Total bruto de pedidos confirmados</small><strong>{formatBRL(confirmedTotal)}</strong></div>
   <div><Clock/><small>Aguardando confirmação</small><strong>{formatBRL(pendingTotal)}</strong></div>
   <div><CheckCircle2/><small>Pedidos confirmados</small><strong>{confirmed.length}</strong></div>
   <div><ShieldAlert/><small>Pedidos cancelados</small><strong>{cancelled.length}</strong></div></div>
  <p className="ops-info"><CreditCard size={18}/> O total bruto considera o status do pedido. Confira tarifas, estornos e repasses no extrato do provedor.</p>
  <section className="ops-form-card"><h2>Pagamentos para conferir</h2>
   {paymentReviews.error?<p className="form-error" role="alert">Histórico do provedor indisponível.</p>:
    paymentReviews.data?.length?<div className="ops-table-scroll"><table className="ops-table">
     <thead><tr><th>Pedido</th><th>Pagamento</th><th>Valor</th><th>Ocorrência</th></tr></thead>
     <tbody>{paymentReviews.data.map(p=>{
      const checkout=Array.isArray(p.commercial_payment_checkouts)?
       p.commercial_payment_checkouts[0]:p.commercial_payment_checkouts;
      return <tr key={p.payment_id}><td>{checkout?<Link href={'/admin/pedidos/'+checkout.order_id+'#etapa-payment'}>
       #{checkout.order_id.slice(0,8).toUpperCase()}</Link>:'Pedido indisponível'}</td>
       <td>#{p.payment_id}<small>{dateTimeBR(p.observed_at)}</small></td><td>{formatBRL(p.amount_cents)}</td>
       <td>{COMMERCIAL_PAYMENT_RESULTS[p.result as CommercialPaymentResult]}<small>{p.status}</small></td>
      </tr>;
     })}</tbody>
    </table></div>:<p className="admin-help">Nenhuma ocorrência de pagamento para conferência.</p>}
  </section>
  <div className="pope-finance-gateways"><div><strong>10 gateways disponíveis para avaliação</strong><p>Mercado Pago, PagBank, Pagar.me, Asaas, Stripe, Efí, PayPal, Cielo, Iugu e InfinitePay. Comparação sem cobrança real.</p></div><Link href="/admin/gateways" className="admin-outline"><Settings2 size={16}/> Central de gateways</Link></div>
  <div className="ops-form-card"><h2>Últimos lançamentos administrativos</h2>
   <div className="ops-table-scroll"><table className="ops-table"><thead><tr><th>Pedido</th><th>Data</th><th>Status</th><th>Valor</th><th>Referência de pagamento</th></tr></thead>
    <tbody>{orders.slice(0,80).map(o=><tr key={o.id}><td>#{o.id.slice(0,8).toUpperCase()}</td>
     <td>{dateTimeBR(o.created_at)}</td><td>{ORDER_LABELS[o.status]??o.status}</td><td><strong>{formatBRL(o.total_cents)}</strong></td><td>{o.payment_reference||'Sem confirmação'}</td></tr>)}</tbody></table>
    {orders.length===0?<div className="admin-empty"><Wallet size={32}/><h3>Nenhum pedido registrado</h3></div>:null}
   </div>
  </div>
 </div>;
}
