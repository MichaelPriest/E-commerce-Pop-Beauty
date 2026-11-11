import Link from 'next/link';
import {Clock,Boxes,ShoppingBag,ShieldCheck,ArrowLeft,AlertCircle} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {formatBRL} from '@/lib/products';
import {dateTimeBR} from '@/types/operations';

export const dynamic='force-dynamic';
export default async function AdminReservationsPage(){
 const sb=await requireAdmin();
 const [orders,setting]=await Promise.all([
  sb.from('orders')
   .select('id,customer_id,status,total_cents,created_at,reservation_expires_at,shipping_address_snapshot,order_items(title_snapshot,quantity,sku_snapshot)')
   .eq('origin','store_api').order('created_at',{ascending:false}).limit(100),
  sb.from('store_settings').select('checkout_reservations_enabled').eq('id',1).maybeSingle()
 ]);
 if(orders.error)return <div className="container admin-workspace">
  <h1>Reservas de homologação</h1><p role="alert" className="form-error">{orders.error.message}</p></div>;
 const rows=orders.data??[];
 const now=Date.now();
 const active=rows.filter(r=>r.status==='pending'&&
  !!r.reservation_expires_at&&new Date(r.reservation_expires_at).getTime()>now);
 const expiredWaiting=rows.filter(r=>r.status==='pending'&&
  !!r.reservation_expires_at&&new Date(r.reservation_expires_at).getTime()<=now);
 return <div className="container admin-workspace">
  <div className="admin-top">
   <div><div className="section-kicker">CHECKOUT • TESTES SEGUROS</div>
    <h1><Clock size={29}/> Reservas de homologação</h1>
    <p>Confira testes de checkout, prazos de reserva e quantidades, sem criar cobranças.</p>
   </div>
   <Link href="/admin/gateways" className="admin-outline"><ArrowLeft size={16}/> Gateways</Link>
  </div>
  <div className="admin-metric-row">
   <div><ShoppingBag/><small>Reservas consultadas</small><strong>{rows.length}</strong></div>
   <div><Boxes/><small>Reservas ativas</small><strong>{active.length}</strong></div>
   <div><Clock/><small>Aguardando rotina de expiração</small><strong>{expiredWaiting.length}</strong></div>
   <div><ShieldCheck/><small>Cobranças habilitadas</small><strong>0</strong></div>
  </div>
  <p className="ops-info"><AlertCircle size={18}/>
   Modo público: <strong>{setting.data?.checkout_reservations_enabled?'ATENÇÃO: liberado':'desativado'}</strong>.
   Administradores autenticados podem testar reservas com prazo de 15 minutos.
   A liberação automática é programada pelo Supabase Cron a cada minuto.
   Esses registros não representam vendas nem pagamentos recebidos.
  </p>
  <div className="ops-table-scroll"><table className="ops-table">
   <thead><tr><th>Criação</th><th>Reserva</th><th>Itens</th><th>Subtotal teste</th><th>Status</th><th>Expira em</th></tr></thead>
   <tbody>{rows.map(r=><tr key={r.id}>
    <td>{dateTimeBR(r.created_at)}</td>
    <td><strong>#{r.id.slice(0,8).toUpperCase()}</strong></td>
    <td>{(r.order_items??[]).map(i=><small key={i.sku_snapshot}>
     {i.quantity}× {i.title_snapshot} ({i.sku_snapshot})</small>)}</td>
    <td>{formatBRL(r.total_cents)}</td>
    <td><span className={'ops-tag status-'+(r.status==='pending'?'pending':'cancelled')}>
     {r.status==='pending'?
       (r.reservation_expires_at&&new Date(r.reservation_expires_at).getTime()<=now?'Expirada — aguardando limpeza':'Reservada (teste)'):
       r.status==='cancelled'?'Encerrada':r.status}</span></td>
    <td>{r.reservation_expires_at?dateTimeBR(r.reservation_expires_at):'—'}</td>
   </tr>)}</tbody>
  </table>
  {!rows.length?<div className="admin-empty"><Clock size={34}/>
   <h3>Nenhuma reserva de teste</h3>
   <p>Para testar, entre na sua conta de administrador, cadastre um endereço e abra a conferência do checkout com um produto real disponível.</p>
  </div>:null}</div>
  <p className="admin-help">Máximo de 100 reservas recentes exibidas. A reserva expirada não dá direito a compra nem mantém preço/frete.</p>
 </div>;
}
