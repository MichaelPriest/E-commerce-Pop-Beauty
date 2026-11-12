import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {buildOrderSandboxQuote,parseOrderSandboxQuotes} from '@/lib/shipping/order-sandbox-quote';
import type {PreparedVolume,ShippingDestination} from '@/lib/shipping/shipment-preparation';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers={'Cache-Control':'private, no-store, max-age=0',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};

export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!uuid.test(id))return NextResponse.json({error:'Pedido inválido.'},{status:400,headers});
 let origin:string|null=null;
 try{origin=new URL(request.headers.get('origin')??'').origin;}catch{}
 if(!origin||origin!==new URL(request.url).origin)
  return NextResponse.json({error:'Origem da solicitação não autorizada.'},{status:403,headers});
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
  return NextResponse.json({error:'Formato inválido.'},{status:415,headers});
 const sb=await createClient();
 const {data:claims,error:authError}=await sb.auth.getClaims();
 if(authError||!claims?.claims?.sub)
  return NextResponse.json({error:'Sessão necessária.'},{status:401,headers});
 const {data:profile,error:profileError}=await sb.from('profiles').select('role')
  .eq('id',claims.claims.sub).maybeSingle();
 if(profileError||profile?.role!=='admin')
  return NextResponse.json({error:'Acesso restrito a administradores.'},{status:403,headers});
 let input:unknown;
 try{
  const text=await request.text();
  if(text.length>1024)throw new Error('Corpo muito grande');
  input=JSON.parse(text);
 }catch{
  return NextResponse.json({error:'Solicitação inválida.'},{status:400,headers});
 }
 const intentKey=input&&typeof input==='object'&&!Array.isArray(input)?
  (input as Record<string,unknown>).intent_key:null;
 if(typeof intentKey!=='string'||!uuid.test(intentKey))
  return NextResponse.json({error:'Identificador de intenção inválido.'},{status:400,headers});

 const {data:intent,error:intentError}=await sb.from('internal_label_intents')
  .select('intent_key,provider,service_code').eq('order_id',id).maybeSingle();
 if(intentError)return NextResponse.json({error:'Falha ao consultar a intenção de remessa.'},
  {status:503,headers});
 if(!intent||intent.intent_key!==intentKey)
  return NextResponse.json({error:'Intenção inexistente ou substituída. Atualize a página.'},
   {status:409,headers});
 if(intent.provider!=='melhor_envio')
  return NextResponse.json({error:'Cotação Correios pendente de contrato e homologação. Não é simulada por este endpoint.'},
   {status:422,headers});
 if(!/^\d{1,8}$/.test(intent.service_code))
  return NextResponse.json({error:'Serviço Melhor Envio precisa conter o ID numérico retornado pelo provedor.'},
   {status:422,headers});
 const token=process.env.MELHOR_ENVIO_SANDBOX_TOKEN?.trim();
 if(!token)return NextResponse.json({error:'Token de sandbox não configurado. Cotação indisponível; nenhuma compra foi solicitada.'},
  {status:503,headers});

 // Revalida o fingerprint no banco. Se houver alteração, a RPC gira a intenção
 // e esta rota interrompe a chamada externa sem cotar dados antigos.
 const {data:verified,error:verifyError}=await sb.rpc('stage_internal_label_intent',{p_order_id:id});
 if(verifyError||!verified)
  return NextResponse.json({error:'Dados da remessa incompletos ou alterados. Confira e registre novamente a intenção.'},
   {status:409,headers});
 if(verified.changed||verified.intent_key!==intentKey)
  return NextResponse.json({error:'Os dados mudaram. Nova intenção interna registrada; atualize e confira antes de cotar.'},
   {status:409,headers});
 const [order,packages,originSettings]=await Promise.all([
  sb.from('orders').select('shipping_address_snapshot').eq('id',id)
   .eq('origin','admin_manual').in('status',['paid','packing']).maybeSingle(),
  sb.from('internal_package_volumes')
   .select('volume_number,weight_g,height_cm,width_cm,length_cm,contents_note')
   .eq('order_id',id).order('volume_number'),
  sb.from('shipping_origin_settings').select('origin_postal_code').eq('id',1).maybeSingle()
 ]);
 if(order.error||packages.error||originSettings.error||!order.data)
  return NextResponse.json({error:'Falha ao carregar dados da remessa.'},{status:503,headers});
 const destination=order.data.shipping_address_snapshot as ShippingDestination|null;
 const volumes:PreparedVolume[]=(packages.data??[]).map(v=>({
  volume_number:v.volume_number,weight_g:v.weight_g,
  height_cm:Number(v.height_cm),width_cm:Number(v.width_cm),
  length_cm:Number(v.length_cm),contents_note:v.contents_note
 }));
 let payload;
 try{
  payload=buildOrderSandboxQuote({
   originZip:String(originSettings.data?.origin_postal_code??'').trim(),
   destinationZip:String(destination?.postal_code??'').trim(),volumes
  });
 }catch{
  return NextResponse.json({error:'Embalagens ou CEPs inválidos para cotação. Refaça a conferência.'},
   {status:409,headers});
 }
 try{
  const response=await fetch('https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate',{
   method:'POST',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000),
   headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json',
    'Accept':'application/json','User-Agent':'PopeBeauty (popebeauty.e@gmail.com)'},
   body:JSON.stringify(payload)
  });
  if(!response.ok)
   return NextResponse.json({
    error:response.status===401||response.status===403?
     'Token rejeitado no sandbox Melhor Envio.':
     'Sandbox não concluiu a cotação (HTTP '+response.status+').'
   },{status:502,headers});
  const responseSize=Number(response.headers.get('content-length')??0);
  if(responseSize>1024*1024)
   return NextResponse.json({error:'Resposta de sandbox acima do limite permitido.'},
    {status:502,headers});
  const raw=await response.json() as unknown;
  const quotes=parseOrderSandboxQuotes(raw,intent.service_code);
  return NextResponse.json({
   sandbox:true,provider:'melhor_envio',order_id:id,intent_key:intentKey,
   consulted_at:new Date().toISOString(),packages_count:volumes.length,
   quotes,quotation_only:true,provider_request_performed:true,
   shipment_purchased:false,label_generated:false,tracking_created:false,
   ready_for_label_purchase:false,quote_saved:false,
   notice:quotes.length?
    'Cotação recebida do sandbox. Revalidar valores, serviço, seguro e regras antes de contratar.':
    'Sandbox não retornou um valor válido para o serviço selecionado. Confira o ID do serviço.'
  },{headers});
 }catch{
  return NextResponse.json({error:'Falha de comunicação ou resposta na sandbox; nenhuma compra realizada.'},
   {status:503,headers});
 }
}
