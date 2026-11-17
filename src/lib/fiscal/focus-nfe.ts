import 'server-only';
import type {orderService} from '@/lib/order-request';
import {isCnpjValid,isCpfValid} from '@/lib/fiscal/readiness-core';
import type {FocusOrderData} from './focus-nfe-core';

export function focusConfig(){
 const environment=process.env.FOCUS_NFE_ENVIRONMENT;
 if(environment!=='homologacao'&&environment!=='producao')return null;
 const token=(environment==='producao'?process.env.FOCUS_NFE_PRODUCAO_TOKEN:process.env.FOCUS_NFE_HOMOLOGACAO_TOKEN)?.trim();
 return token?{environment,token,base:environment==='producao'?'https://api.focusnfe.com.br':'https://homologacao.focusnfe.com.br'} as const:null;
}
export async function focusRequest(config:NonNullable<ReturnType<typeof focusConfig>>,path:string,method='GET',body?:object){
 return fetch(config.base+path,{method,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000),
  headers:{Authorization:'Basic '+Buffer.from(config.token+':').toString('base64'),
   ...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
}

export async function loadFocusOrder(sb:NonNullable<ReturnType<typeof orderService>>,id:string):Promise<FocusOrderData>{
 const [order,issuer,recipient,draft]=await Promise.all([
  sb.from('orders').select('status,total_cents,checkout_delivery_fee_cents,shipping_address_snapshot,order_items(variant_id,sku_snapshot,title_snapshot,quantity,unit_price_cents)').eq('id',id).eq('origin','admin_manual').maybeSingle(),
  sb.from('fiscal_issuer_settings').select('*').eq('id',1).maybeSingle(),
  sb.from('fiscal_order_recipients').select('tax_id,full_name,state_registration').eq('order_id',id).maybeSingle(),
  sb.from('fiscal_order_drafts').select('fiscal_model,operation_nature').eq('order_id',id).maybeSingle(),
 ]);
 if(!order.data||!['paid','packing'].includes(order.data.status))throw new Error('Selecione um pedido pago.');
 if(!draft.data||draft.data.fiscal_model!=='55')throw new Error('Prepare um rascunho de NF-e modelo 55 na área Fiscal.');
 if(!issuer.data||!isCnpjValid(issuer.data.cnpj)||!issuer.data.tax_regime||!issuer.data.legal_name||
    !issuer.data.state_registration||!issuer.data.street||!issuer.data.house_number||!issuer.data.district||
    !issuer.data.city||!/^\d{8}$/.test(issuer.data.postal_code))throw new Error('Complete o cadastro fiscal do emitente.');
 if(!recipient.data?.full_name||!(isCpfValid(recipient.data.tax_id)||isCnpjValid(recipient.data.tax_id)))
  throw new Error('Complete o destinatário fiscal com CPF ou CNPJ válido.');
 const address=order.data.shipping_address_snapshot;
 if(!address?.street||!address.house_number||!address.district||!address.city||!address.state_code||!/^\d{8}$/.test(address.postal_code??''))
  throw new Error('Cadastre o endereço de entrega do pedido.');
 const lines=order.data.order_items??[];
 if(!lines.length||lines.reduce((sum,x)=>sum+x.quantity*x.unit_price_cents,0)+order.data.checkout_delivery_fee_cents!==order.data.total_cents)
  throw new Error('Confira os valores dos produtos e da entrega.');
 const variants=await sb.from('variants').select('id,product_id').in('id',lines.flatMap(l=>l.variant_id?[l.variant_id]:[]));
 if(variants.error)throw new Error('Tributos dos produtos indisponíveis.');
 const byVariant=new Map((variants.data??[]).map(v=>[v.id,v.product_id]));
 const taxes=await sb.from('product_fiscal_details').select('*').in('product_id',[...new Set(byVariant.values())]);
 if(taxes.error)throw new Error('Tributos dos produtos indisponíveis.');
 const byProduct=new Map((taxes.data??[]).map(t=>[t.product_id,t]));
 return {totalCents:order.data.total_cents,freightCents:order.data.checkout_delivery_fee_cents,
  issuer:issuer.data,recipient:recipient.data,address,nature:draft.data.operation_nature??'',
  items:lines.map(i=>({sku:i.sku_snapshot,title:i.title_snapshot,quantity:i.quantity,priceCents:i.unit_price_cents,
   tax:byProduct.get(byVariant.get(i.variant_id??'')??'')??{}}))};
}
