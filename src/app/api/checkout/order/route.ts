import {NextRequest} from 'next/server';
import {orderResponse,orderSession,orderUuid} from '@/lib/order-request';
import {commercialPaymentStore,mpLivePaymentConfig,prepareMpOrderLink} from '@/lib/payments/mercado-pago-live';
import {isCpfValid} from '@/lib/fiscal/readiness-core';
import type {CheckoutDeliveryOrder} from '@/lib/checkout-delivery';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(request:NextRequest){
 const config=mpLivePaymentConfig();
 if(!config?.linkOrigin)return orderResponse({error:'Checkout comercial indisponível.'},503);
 const session=await orderSession(request);
 if(session.error)return session.error;
 const {sb,user}=session;
 const {data:settings}=await sb.from('store_settings').select('commercial_checkout_enabled').eq('id',1).maybeSingle();
 if(!settings?.commercial_checkout_enabled)return orderResponse({error:'Checkout comercial indisponível.'},503);
 const body=await request.json().catch(()=>null);
 if(!body||typeof body!=='object'||Array.isArray(body))return orderResponse({error:'Dados inválidos.'},400);
 if(body.action==='payment'){
  if(typeof body.order_id!=='string'||!orderUuid.test(body.order_id))return orderResponse({error:'Pedido inválido.'},400);
  const {data:order}=await sb.from('orders').select('id').eq('id',body.order_id)
   .eq('customer_id',user).eq('storefront_order',true).eq('status','pending').maybeSingle();
  if(!order)return orderResponse({error:'Pedido pendente indisponível.'},404);
  const {status,...result}=await prepareMpOrderLink(config,order.id,user,true);
  return orderResponse(result,status);
 }

 const {p_address_id,p_rate_id,p_rate_revision,p_address_version,p_items,p_request_key,full_name,tax_id}=body;
 const name=typeof full_name==='string'?full_name.trim():'';
 const cpf=typeof tax_id==='string'?tax_id.replace(/[^0-9]/g,''):'';
 if(![p_address_id,p_rate_id,p_rate_revision,p_request_key].every(v=>typeof v==='string'&&orderUuid.test(v))||
    typeof p_address_version!=='string'||p_address_version.length>50||!Number.isFinite(Date.parse(p_address_version))||
    name.length<2||name.length>160||!isCpfValid(cpf)||!Array.isArray(p_items)||!p_items.length||p_items.length>30){
  return orderResponse({error:'Confira endereço, itens, entrega e CPF para a nota fiscal.'},400);
 }
 const items=p_items.map((item:{[k:string]:unknown}|null)=>({
  product_id:item?.product_id,variant_id:item?.variant_id,quantity:item?.quantity,unit_price_cents:item?.unit_price_cents,
 }));
 if(items.some(i=>typeof i.product_id!=='string'||!orderUuid.test(i.product_id)||
   typeof i.variant_id!=='string'||!orderUuid.test(i.variant_id)||typeof i.quantity!=='number'||
   !Number.isSafeInteger(i.quantity)||i.quantity<1||i.quantity>99||typeof i.unit_price_cents!=='number'||
   !Number.isSafeInteger(i.unit_price_cents)||i.unit_price_cents<=0||i.unit_price_cents>100000000)){
  return orderResponse({error:'Confira os SKU, quantidades e preços do carrinho.'},400);
 }
 const {data,error}=await commercialPaymentStore(config).rpc('create_storefront_order',{
  p_address_id,p_rate_id,p_rate_revision,p_address_version,p_items:items,p_request_key,
  p_user:user,p_tax_id:cpf,p_full_name:name,
 });
 if(error||!data)return orderResponse({error:error?.code==='P0001'?error.message:'Não foi possível criar o pedido.'},409);
 const order=data as CheckoutDeliveryOrder;
 if(order.status!=='pending')return orderResponse(order);
 const payment=await prepareMpOrderLink(config,order.order_id,user,true);
 return orderResponse({...order,checkout_url:payment.checkout_url,payment_error:payment.error},201);
}
