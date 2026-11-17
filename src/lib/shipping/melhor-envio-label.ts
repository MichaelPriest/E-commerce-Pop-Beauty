import 'server-only';
import {isCnpjValid,isCpfValid} from '@/lib/fiscal/readiness-core';
import type {orderService} from '@/lib/order-request';
import {filterLabelQuotes} from './melhor-envio-label-core';

export function labelConfig(){
 const environment=process.env.MELHOR_ENVIO_LABEL_ENVIRONMENT;
 if(environment!=='sandbox'&&environment!=='producao')return null;
 const token=(environment==='producao'?process.env.MELHOR_ENVIO_PRODUCTION_TOKEN:process.env.MELHOR_ENVIO_SANDBOX_TOKEN)?.trim();
 const email=process.env.MELHOR_ENVIO_CONTACT_EMAIL?.trim();
 const phone=process.env.MELHOR_ENVIO_SENDER_PHONE?.replace(/\D/g,'');
 if(!token||!email||!/^\S+@\S+\.\S+$/.test(email)||!phone||!/^\d{10,11}$/.test(phone))return null;
 return {environment,token,email,phone,base:environment==='producao'?'https://melhorenvio.com.br':'https://sandbox.melhorenvio.com.br'} as const;
}
export type LabelConfig=NonNullable<ReturnType<typeof labelConfig>>;

export async function labelRequest(config:Pick<LabelConfig,'base'|'token'|'email'>,path:string,body?:object,accept='application/json'){
 return fetch(config.base+'/api/v2/me/'+path,{method:body?'POST':'GET',cache:'no-store',redirect:'error',
  signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+config.token,Accept:accept,
   'User-Agent':`Popê Beauty (${config.email})`,...(body?{'Content-Type':'application/json'}:{})},
  body:body?JSON.stringify(body):undefined});
}

export async function labelJson(config:LabelConfig,path:string,body?:object){
 const response=await labelRequest(config,path,body);
 if(!response.ok)throw new LabelProviderError(response.status);
 return response.json();
}
export class LabelProviderError extends Error{
 constructor(readonly status:number){super('O Melhor Envio respondeu com HTTP '+status+'.');}
}

export async function labelOrder(sb:NonNullable<ReturnType<typeof orderService>>,id:string,config:LabelConfig){
 const [order,invoice,issuer,origin,prep,volumes,recipient]=await Promise.all([
  sb.from('orders').select('status,shipping_address_snapshot,order_items(title_snapshot,quantity,unit_price_cents)').eq('id',id).eq('origin','admin_manual').maybeSingle(),
  sb.from('store_nfe_documents').select('invoice_key').eq('order_id',id).eq('environment',config.environment==='sandbox'?'homologacao':'producao').eq('status','authorized').maybeSingle(),
  sb.from('fiscal_issuer_settings').select('*').eq('id',1).maybeSingle(),
  sb.from('shipping_origin_settings').select('origin_postal_code').eq('id',1).maybeSingle(),
  sb.from('internal_package_preparations').select('volumes').eq('order_id',id).maybeSingle(),
  sb.from('internal_package_volumes').select('volume_number,height_cm,width_cm,length_cm,weight_g').eq('order_id',id).order('volume_number'),
  sb.from('fiscal_order_recipients').select('full_name,tax_id,state_registration').eq('order_id',id).maybeSingle(),
 ]);
 if(!order.data||!['paid','packing'].includes(order.data.status))throw new Error('Selecione um pedido pago em preparação.');
 if(!invoice.data?.invoice_key)throw new Error('A etiqueta comercial exige uma NF-e autorizada no ambiente correspondente.');
 const s=issuer.data,a=order.data.shipping_address_snapshot,doc=recipient.data?.tax_id;
 if(!s||!isCnpjValid(s.cnpj)||!s.legal_name||!s.state_registration||!s.city||!s.street||!s.house_number||!s.district||
    !/^\d{8}$/.test(origin.data?.origin_postal_code??'')||s.postal_code!==origin.data?.origin_postal_code){
  throw new Error('Confira endereço do remetente, CNPJ, inscrição estadual e CEP de postagem no cadastro da loja.');
 }
 if(!a?.recipient||!a.phone||!a.street||!a.house_number||!a.district||!a.city||!a.state_code||!/^\d{8}$/.test(a.postal_code??'')||
    !(isCpfValid(doc)||isCnpjValid(doc)))throw new Error('Complete o endereço e o documento do destinatário.');
 const boxes=(volumes.data??[]).filter(v=>v.volume_number<=(prep.data?.volumes??0));
 if(!boxes.length||boxes.length!==prep.data?.volumes)throw new Error('Confira peso e medidas de todos os volumes previstos.');
 const products=(order.data.order_items??[]).map(i=>({name:i.title_snapshot,quantity:i.quantity,unitary_value:i.unit_price_cents/100}));
 if(!products.length||products.some(i=>i.unitary_value<=0))throw new Error('Confira os produtos da declaração para transporte.');
 return {
  from:{name:s.legal_name,email:config.email,phone:config.phone,company_document:s.cnpj,state_register:s.state_registration,
   address:s.street,number:s.house_number,district:s.district,city:s.city,postal_code:s.postal_code,state_abbr:s.state_code,country_id:'BR'},
  to:{name:a.recipient,phone:a.phone,address:a.street,number:a.house_number,complement:a.complement,
   district:a.district,city:a.city,postal_code:a.postal_code,state_abbr:a.state_code,country_id:'BR',
   ...(doc?.length===11?{document:doc}:{company_document:doc,state_register:recipient.data?.state_registration??undefined})},
  products,volumes:boxes.map(v=>({height:v.height_cm,width:v.width_cm,length:v.length_cm,weight:v.weight_g/1000,
   insurance_value:0})),
  invoiceKey:invoice.data.invoice_key,
  insurance:Number(products.reduce((sum,i)=>sum+i.quantity*i.unitary_value,0).toFixed(2)),
 };
}

export async function quoteLabels(config:LabelConfig,shipment:Awaited<ReturnType<typeof labelOrder>>){
 const raw=await labelJson(config,'shipment/calculate',{
  from:{postal_code:shipment.from.postal_code},to:{postal_code:shipment.to.postal_code},
  volumes:shipment.volumes,options:{insurance_value:shipment.insurance,receipt:false,own_hand:false},
 });
 return filterLabelQuotes(raw,shipment.volumes.length);
}
