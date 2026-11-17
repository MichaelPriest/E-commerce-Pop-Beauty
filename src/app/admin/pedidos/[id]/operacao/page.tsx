import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ArrowLeft} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {orderUuid} from '@/lib/order-request';
import {focusConfig} from '@/lib/fiscal/focus-nfe';
import {labelConfig} from '@/lib/shipping/melhor-envio-label';
import {mpLivePaymentConfig} from '@/lib/payments/mercado-pago-live';
import {ORDER_LABELS} from '@/types/operations';
import {formatBRL} from '@/lib/products';
import {StoreOrderOperations} from './store-order-operations';

export const dynamic='force-dynamic';
export const metadata={title:'Operação do pedido | Popê Beauty'};

export default async function OrderOperationsPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!orderUuid.test(id))notFound();
 const sb=await requireAdmin();
 const fiscal=focusConfig(),shipping=labelConfig();
 const [order,cancellation,payments,refunds,nfe,label]=await Promise.all([
  sb.from('orders').select('id,status,total_cents,shipped_at,storefront_order').eq('id',id).eq('origin','admin_manual').maybeSingle(),
  sb.from('store_order_cancellations').select('state,reason').eq('order_id',id).maybeSingle(),
  sb.from('commercial_payment_checkouts').select('commercial_provider_payments(payment_id,status,amount_cents,confirmed_at)').eq('order_id',id),
  sb.from('store_order_refunds').select('payment_id,state').eq('order_id',id),
  sb.from('store_nfe_documents').select('status,environment,invoice_key,provider_message')
   .eq('order_id',id).eq('environment',fiscal?.environment??'producao').maybeSingle(),
  sb.from('store_shipping_labels').select('id,status,environment,provider_id,cost_cents,max_cost_cents,carrier,tracking_code')
   .eq('order_id',id).eq('environment',shipping?.environment??'producao').maybeSingle(),
 ]);
 if(order.error)throw new Error('Não foi possível consultar o pedido.');
 if(!order.data)notFound();
 if([cancellation,payments,refunds,nfe,label].some(result=>result.error))throw new Error('Não foi possível consultar as operações do pedido.');
 const paymentRows=(payments.data??[]).flatMap(p=>p.commercial_provider_payments)
  .filter(p=>['approved','refunded'].includes(p.status));
 return <div className="container admin-workspace">
  <div className="admin-top"><div><h1>Operação do pedido #{id.slice(0,8).toUpperCase()}</h1>
   <p>{order.data.storefront_order?'Compra online':'Pedido interno'} · {ORDER_LABELS[order.data.status]} · {formatBRL(order.data.total_cents)}</p>
  </div><Link className="admin-outline" href={'/admin/pedidos/'+id}><ArrowLeft size={17}/> Voltar ao pedido</Link></div>
  <StoreOrderOperations order={order.data} cancellation={cancellation.data} payments={paymentRows} refunds={refunds.data??[]}
   canRefund={Boolean(mpLivePaymentConfig())} nfe={nfe.data} fiscalEnvironment={fiscal?.environment??null}
   label={label.data} shippingEnvironment={shipping?.environment??null}/>
 </div>;
}
