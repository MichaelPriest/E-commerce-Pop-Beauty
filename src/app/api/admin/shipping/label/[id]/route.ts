import {NextRequest,NextResponse} from 'next/server';
import {orderResponse,orderService,orderSession,orderUuid,privateHeaders} from '@/lib/order-request';
import {labelConfig,labelJson,labelOrder,labelRequest,LabelProviderError,quoteLabels} from '@/lib/shipping/melhor-envio-label';
import {melhorEnvioLabelStatus,melhorEnvioPrintLink} from '@/lib/shipping/melhor-envio-label-core';
import {decimalCents} from '@/lib/fiscal/focus-nfe-core';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Route={params:Promise<{id:string}>};
const printable=['generated','posted','delivered'];

export async function GET(request:NextRequest,{params}:Route){
 const config=labelConfig(),service=orderService();
 if(!config||!service)return orderResponse({error:'Contratação de frete aguardando configuração.'},503);
 const session=await orderSession(request,true);
 if(session.error)return session.error;
 const {id}=await params;
 if(!orderUuid.test(id))return orderResponse({error:'Pedido inválido.'},400);
 const {data}=await service.from('store_shipping_labels').select('provider_id,status')
  .eq('order_id',id).eq('environment',config.environment).maybeSingle();
 if(!data?.provider_id||!printable.includes(data.status))return orderResponse({error:'Etiqueta ainda indisponível.'},404);
 try{
  const file=await labelRequest(config,'imprimir/pdf/'+data.provider_id,undefined,'application/pdf');
  if(!file.ok||Number(file.headers.get('content-length'))>10_000_000)throw new Error();
  const bytes=await file.arrayBuffer();
  if(bytes.byteLength>10_000_000||Buffer.from(bytes.slice(0,5)).toString()!=='%PDF-')throw new Error();
  return new NextResponse(bytes,{headers:{...privateHeaders,'Content-Type':'application/pdf',
   'X-Content-Type-Options':'nosniff','Content-Disposition':`attachment; filename="pope-etiqueta-${id.slice(0,8)}.pdf"`}});
 }catch{return orderResponse({error:'PDF indisponível. Abra o link privado do Melhor Envio para imprimir.'},502);}
}

export async function POST(request:NextRequest,{params}:Route){
 const config=labelConfig(),service=orderService();
 if(!config||!service)return orderResponse({error:'Contratação de frete aguardando configuração.'},503);
 const session=await orderSession(request,true);
 if(session.error)return session.error;
 const {id}=await params;
 if(!orderUuid.test(id))return orderResponse({error:'Pedido inválido.'},400);
 const body=await request.json().catch(()=>null);
 if(!body||typeof body!=='object')return orderResponse({error:'Dados inválidos.'},400);
 const action=body.action as string;
 const labels=()=>service.from('store_shipping_labels');
 if(action==='quote'||action==='cart'){
  let shipment;
  try{shipment=await labelOrder(service,id,config);}
  catch(e){return orderResponse({error:e instanceof Error?e.message:'Dados de envio indisponíveis.'},409);}
  let quotes;
  try{quotes=await quoteLabels(config,shipment);}
  catch{return orderResponse({error:'Não foi possível obter fretes no Melhor Envio.'},502);}
  if(action==='quote')return orderResponse({quotes});
  const chosen=quotes.find(q=>q.id===body.service_id);
  const max=body.max_cost_cents;
  const agency=body.agency_id??null;
  if(!chosen||!Number.isSafeInteger(max)||chosen.costCents>max||max<=0||
     (agency!==null&&(!Number.isSafeInteger(agency)||agency<=0))){
   return orderResponse({error:'Cotação alterada. Confira o serviço, o custo e a agência.'},409);
  }
  const {data:claim,error}=await service.rpc('claim_store_label_cart',{
   p_order_id:id,p_environment:config.environment,p_service_id:chosen.id,p_agency_id:agency,
   p_max_cost_cents:max,p_invoice_key:shipment.invoiceKey,
  });
  if(error||!claim)return orderResponse({error:error?.code==='P0001'?error.message:'Já existe um envio neste ambiente. Consulte a situação.'},409);
  try{
   const remote=await labelJson(config,'cart',{
    service:chosen.id,...(agency?{agency}:{}),from:shipment.from,to:shipment.to,products:shipment.products,
    volumes:shipment.volumes.map(({height,width,length,weight})=>({height,width,length,weight})),
    options:{platform:'Popê Beauty',insurance_value:shipment.insurance,receipt:false,own_hand:false,
     invoice:{key:shipment.invoiceKey},tags:[{tag:claim,url:null}]},
   });
   if(typeof remote?.id!=='string'||!orderUuid.test(remote.id))throw new Error();
   const cost=decimalCents(remote.price);
   const {error:write}=await labels().update({provider_id:remote.id,cost_cents:cost,carrier:chosen.carrier,
    status:'cart_ready',updated_at:new Date().toISOString()}).eq('id',claim).eq('status','cart_creating');
   if(write)throw write;
   return orderResponse({message:'Envio adicionado ao carrinho. Confira o custo antes de comprar.'});
  }catch(e){
   if(e instanceof LabelProviderError&&[400,422].includes(e.status)){
    await labels().update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',claim).eq('status','cart_creating');
    return orderResponse({error:'Dados recusados pelo Melhor Envio. Confira a agência, volumes e destinatário.'},422);
   }
   return orderResponse({error:'Carrinho sem confirmação. Use a referência exibida para recuperar o envio.'},502);
  }
 }

 const {data:label}=await labels().select('*').eq('order_id',id).eq('environment',config.environment).maybeSingle();
 if(!label)return orderResponse({error:'Envio ainda indisponível.'},404);
 if(action==='recover'){
  const candidate=body.provider_id;
  if(label.status!=='cart_creating'||label.provider_id||typeof candidate!=='string'||!orderUuid.test(candidate))
   return orderResponse({error:'Informe o ID do envio correspondente à preparação.'},400);
  try{
   const remote=await labelJson(config,'orders/'+candidate);
   const tags=remote.tags??remote.options?.tags;
   const correlated=Array.isArray(tags)&&tags.some(t=>t===label.id||t?.tag===label.id);
   if(remote.id!==candidate||!correlated)return orderResponse({error:'O Melhor Envio não confirmou a referência deste pedido.'},409);
   const status=melhorEnvioLabelStatus(remote);
   if(!status)throw new Error();
   const {error}=await labels().update({provider_id:candidate,status,cost_cents:decimalCents(remote.price),
    carrier:String(remote.service?.company?.name??'').slice(0,80)||null,
    updated_at:new Date().toISOString()}).eq('id',label.id).eq('status','cart_creating');
   if(error)throw error;
   return orderResponse({message:'Envio recuperado.'});
  }catch{return orderResponse({error:'Não foi possível recuperar o envio.'},502);}
 }
 if(!label.provider_id)return orderResponse({error:'Recupere o ID do envio antes de continuar.'},409);
 if(action==='print'){
  if(!printable.includes(label.status))return orderResponse({error:'Gere a etiqueta antes de imprimir.'},409);
  try{
   const data=await labelJson(config,'shipment/print',{orders:[label.provider_id],mode:'private'});
   const url=melhorEnvioPrintLink(data.url,config.environment);
   if(!url)throw new Error();
   return orderResponse({url});
  }catch{return orderResponse({error:'Link de impressão indisponível.'},502);}
 }
 if(!['status','buy','generate','cancel','dispatch'].includes(action))return orderResponse({error:'Operação inválida.'},400);

 async function refresh(previous:typeof label){
  const remote=await labelJson(config!,'orders/'+previous.provider_id);
  const observed=melhorEnvioLabelStatus(remote);
  if(!observed||remote.id!==previous.provider_id)throw new Error('Retorno não identificado.');
  let status:string=observed;
  const order=['cart_ready','paid','generated','posted','delivered'];
  if(previous.status==='cancelled'||previous.status==='cancelling'&&status!=='cancelled'||
     status!=='cancelled'&&order.includes(previous.status)&&order.indexOf(status)<order.indexOf(previous.status)||
     previous.status==='buying'&&status==='cart_ready'&&Date.now()-Date.parse(previous.updated_at)<60_000||
     previous.status==='generating'&&status==='paid'&&Date.now()-Date.parse(previous.updated_at)<60_000){
   status=previous.status;
  }
  const tracking=typeof remote.tracking==='string'&&/^[0-9A-Za-z -]{5,120}$/.test(remote.tracking)?remote.tracking:previous.tracking_code;
  const carrier=String(remote.service?.company?.name??previous.carrier??'').slice(0,80)||null;
  const values={status,tracking_code:tracking,carrier,cost_cents:decimalCents(remote.price)??previous.cost_cents};
  const {error}=await labels().update(values).eq('id',previous.id).eq('status',previous.status);
  if(error)throw error;
  return values;
 }

 try{
  const current=await refresh(label);
  if(action==='status')return orderResponse({message:'Situação atualizada pelo Melhor Envio.'});
  if(action==='dispatch'){
   if(config.environment!=='producao'||!['posted','delivered'].includes(current.status)||!current.tracking_code||!current.carrier)
    return orderResponse({error:'A postagem oficial ainda não foi confirmada.'},409);
   const {data:order}=await session.sb.from('orders').select('status').eq('id',id).maybeSingle();
   if(order?.status==='delivered'||order?.status==='shipped'&&current.status!=='delivered')
    return orderResponse({message:'Postagem já registrada.'});
   const {error}=await session.sb.rpc('transition_admin_order',{p_order_id:id,
    p_next_status:order?.status==='shipped'?'delivered':'shipped',p_note:'Postagem ou entrega confirmada pelo Melhor Envio.',
    p_carrier:current.carrier,p_tracking_code:current.tracking_code});
   return error?orderResponse({error:error.message},409):orderResponse({message:'Pedido atualizado com o rastreio oficial.'});
  }
  const reason=typeof body.reason==='string'?body.reason.trim():'';
  if(action==='cancel'&&(reason.length<3||reason.length>255))return orderResponse({error:'Informe o motivo do cancelamento.'},400);
  const {data:claimed,error}=await service.rpc('claim_store_label_step',{p_order_id:id,p_environment:config.environment,p_action:action});
  if(error||!claimed)return orderResponse({error:error?.code==='P0001'?error.message:'Confira a situação e o custo autorizado para este envio.'},409);
  const stage=action==='buy'?'buying':action==='generate'?'generating':'cancelling';
  try{
   await labelJson(config,action==='buy'?'shipment/checkout':action==='generate'?'shipment/generate':'shipment/cancel',
    action==='cancel'?{order:{id:label.provider_id,reason_id:'2',description:reason}}:{orders:[label.provider_id]});
  }catch(e){
   if(e instanceof LabelProviderError&&[400,402,422].includes(e.status))
    await labels().update({status:current.status}).eq('id',label.id).eq('status',stage);
   throw e;
  }
  await refresh({...label,status:stage,updated_at:new Date().toISOString()});
  return orderResponse({message:'Operação enviada. Confira a situação do envio.'});
 }catch{return orderResponse({error:'A operação ainda precisa de confirmação. Atualize a situação antes de repetir.'},502);}
}
