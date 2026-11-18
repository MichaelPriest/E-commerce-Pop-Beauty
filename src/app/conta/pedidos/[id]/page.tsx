import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {ArrowLeft,CheckCircle2,Clock3,MapPin,Package,Truck} from 'lucide-react';
import {createClient} from '@/lib/supabase/server';
import {getStorefrontCustomer} from '@/lib/storefront-customer';
import {formatBRL} from '@/lib/products';
import {dateTimeBR,ORDER_LABELS} from '@/types/operations';
import {
 customerOrderProgress,customerDeliveryAddress,customerDeliveryMethod
} from '@/lib/customer-order-summary';
import {mpLivePaymentConfig} from '@/lib/payments/mercado-pago-live';
import {StoreOrderActions} from '@/components/checkout/store-order-actions';
import {CancelTestReservation} from '@/components/cancel-test-reservation';

export const dynamic='force-dynamic';
export const metadata={title:'Detalhes do pedido | Popê Beauty',robots:{index:false,follow:false}};
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

export default async function CustomerOrderDetails({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!uuid.test(id))notFound();
 const customer=await getStorefrontCustomer();
 if(!customer)redirect('/entrar');
 const sb=await createClient();
 // Autorização em profundidade: filtro pelo dono + política RLS no Supabase.
 const {data:o,error:orderError}=await sb.from('orders')
  .select('id,customer_id,origin,storefront_order,status,total_cents,created_at,reservation_expires_at,checkout_delivery_fee_cents,checkout_delivery_snapshot,shipping_address_snapshot,carrier,tracking_code,shipped_at,delivered_at,store_order_cancellations(state)')
  .eq('id',id).eq('customer_id',customer.id).maybeSingle();
 if(orderError)throw new Error('Não foi possível consultar este pedido.');
 if(!o)notFound();
 const {data:items,error:itemsError}=await sb.from('order_items')
  .select('id,title_snapshot,sku_snapshot,quantity,unit_price_cents')
  .eq('order_id',o.id).order('sku_snapshot',{ascending:true}).limit(100);
 if(itemsError)throw new Error('Não foi possível carregar os produtos do pedido.');
 const orderItems=items??[];
 const subtotal=orderItems.reduce((sum,item)=>sum+item.quantity*item.unit_price_cents,0);
 const address=customerDeliveryAddress(o.shipping_address_snapshot);
 const deliveryMethod=customerDeliveryMethod(o.checkout_delivery_snapshot);
 const test=o.origin==='store_api';
 const cancellation=Array.isArray(o.store_order_cancellations)?
  o.store_order_cancellations[0]:o.store_order_cancellations;
 const closed=o.status==='cancelled'||o.status==='refunded';
 const progression=customerOrderProgress(o.status);
 const canAct=o.storefront_order&&!closed&&cancellation?.state!=='requested';
 const pay=canAct&&o.status==='pending'&&!!mpLivePaymentConfig()?.linkOrigin&&
  !!o.reservation_expires_at&&Date.parse(o.reservation_expires_at)>Date.now();
 return <div className="container customer-area customer-order-detail">
  <Link href="/conta#pedidos" className="customer-back"><ArrowLeft size={16}/> Voltar aos meus pedidos</Link>
  <header className="customer-order-detail-top">
   <div><div className="section-kicker">POPÊ BEAUTY • MEUS PEDIDOS</div>
    <h1>Pedido #{o.id.slice(0,8).toUpperCase()}</h1>
    <p>{test?'Reserva para homologação':o.storefront_order?'Compra online':'Pedido registrado'} em {dateTimeBR(o.created_at)}</p>
   </div>
   <span className="order-status" data-status={o.status}>{ORDER_LABELS[o.status]??o.status}</span>
  </header>
  <div className="customer-order-detail-grid">
   <div className="customer-order-detail-main">
    <section className="customer-order-detail-panel">
     <h2><Package size={20}/> Acompanhamento</h2>
     {closed?<p role="status">Este pedido está {o.status==='refunded'?'reembolsado':'cancelado'}.
      As etapas de envio não estão mais em andamento.</p>:
     <ol className="customer-order-timeline" aria-label="Etapas do pedido">
      {progression.map(stage=><li key={stage.status} data-state={stage.state}>
       {stage.state==='done'?<CheckCircle2 aria-hidden="true" size={20}/>:
        stage.state==='current'?<Clock3 aria-hidden="true" size={20}/>:
        <span className="customer-order-stage-dot" aria-hidden="true"/>}
       <span><strong>{stage.label}</strong>
        {stage.state==='current'&&<small>Etapa atual</small>}</span>
      </li>)}
     </ol>}
     {o.carrier&&<p className="customer-tracking"><Truck size={16}/> Transportadora: <strong>{o.carrier}</strong></p>}
     {o.tracking_code&&<p className="customer-tracking"><Truck size={16}/> Código de rastreio: <strong>{o.tracking_code}</strong></p>}
     {o.shipped_at&&<p>Enviado em {dateTimeBR(o.shipped_at)}</p>}
     {o.delivered_at&&<p>Entrega registrada em {dateTimeBR(o.delivered_at)}</p>}
     {cancellation?.state==='requested'&&<p role="status">Cancelamento solicitado. Aguardando análise.</p>}
     {test&&o.status==='pending'&&<><p>Reserva de teste; nenhum pagamento real é realizado.
      {o.reservation_expires_at?' Expira em '+dateTimeBR(o.reservation_expires_at)+'.':''}</p>
      <CancelTestReservation orderId={o.id}/></>}
     {canAct&&<StoreOrderActions orderId={o.id} pay={pay} cancel={true}/>}
    </section>
    <section className="customer-order-detail-panel">
     <h2><Package size={20}/> Produtos do pedido</h2>
     {orderItems.length?<ul className="customer-order-products">
      {orderItems.map(item=><li key={item.id}>
       <div><strong>{item.title_snapshot}</strong><small>SKU: {item.sku_snapshot}</small>
        <small>{item.quantity} × {formatBRL(item.unit_price_cents)}</small></div>
       <b>{formatBRL(item.quantity*item.unit_price_cents)}</b>
      </li>)}
     </ul>:<p>Não há itens disponíveis para exibição neste pedido.</p>}
    </section>
   </div>
   <aside className="customer-order-detail-side">
    <section className="customer-order-detail-panel">
     <h2>Resumo financeiro</h2>
     <dl className="customer-order-values">
      <div><dt>Subtotal dos produtos</dt><dd>{formatBRL(subtotal)}</dd></div>
      {deliveryMethod&&<div><dt>Entrega · {deliveryMethod}</dt>
       <dd>{formatBRL(o.checkout_delivery_fee_cents??0)}</dd></div>}
      <div className="customer-order-total"><dt>Total do pedido</dt><dd>{formatBRL(o.total_cents)}</dd></div>
     </dl>
     <small>Valor registrado no pedido; não representa, por si só, pagamento confirmado.</small>
    </section>
    {address.length>0&&<section className="customer-order-detail-panel">
     <h2><MapPin size={19}/> Endereço de entrega</h2>
     <address>{address.map((line,i)=><span key={i}>{line}</span>)}</address>
    </section>}
    <Link href="/conta/enderecos" className="customer-link-button">Gerenciar meus endereços</Link>
   </aside>
  </div>
 </div>;
}
