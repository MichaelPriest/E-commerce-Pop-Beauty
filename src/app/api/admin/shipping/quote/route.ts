import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type CartItem={product_id:string;quantity:number};
type ProviderService={
 id:unknown;name?:unknown;custom_price?:unknown;price?:unknown;
 custom_delivery_time?:unknown;delivery_time?:unknown;
 company?:{name?:unknown};error?:unknown;
};
function priceCents(value:unknown){
 if(typeof value!=='number'&&typeof value!=='string')return null;
 const raw=String(value).trim();
 if(!/^\d{1,6}(?:\.\d{1,2})?$/.test(raw))return null;
 const cents=Math.round(Number(raw)*100);
 return Number.isInteger(cents)&&cents>0&&cents<=100000000?cents:null;
}
export async function POST(request:NextRequest){
 const origin=request.headers.get('origin');
 let host='';
 try{host=origin?new URL(origin).host:'';}catch{}
 if(!host||host!==new URL(request.url).host){
  return NextResponse.json({error:'Origem não autorizada.'},{status:403,headers});
 }
 const sb=await createClient();
 const {data:claims,error:authError}=await sb.auth.getClaims();
 if(authError||!claims?.claims?.sub)return NextResponse.json(
  {error:'Sessão necessária.'},{status:401,headers});
 const {data:profile}=await sb.from('profiles').select('role')
  .eq('id',claims.claims.sub).maybeSingle();
 if(profile?.role!=='admin')return NextResponse.json(
  {error:'Somente administradores podem simular frete.'},{status:403,headers});
 let body:unknown;
 try{body=await request.json();}catch{
  return NextResponse.json({error:'Solicitação inválida.'},{status:400,headers});
 }
 if(!body||typeof body!=='object')return NextResponse.json({error:'Solicitação inválida.'},
  {status:400,headers});
 const input=body as {postal_code?:unknown;items?:unknown};
 if(typeof input.postal_code!=='string'||!/^[0-9]{8}$/.test(input.postal_code)||
  !Array.isArray(input.items)||input.items.length<1||input.items.length>10){
  return NextResponse.json({error:'Informe CEP de destino e de 1 a 10 produtos.'},
   {status:400,headers});
 }
 const items:CartItem[]=[];const seen=new Set<string>();let totalQty=0;
 for(const x of input.items){
  if(!x||typeof x!=='object')return NextResponse.json(
   {error:'Item inválido.'},{status:400,headers});
  const item=x as {product_id?:unknown;quantity?:unknown};
  if(typeof item.product_id!=='string'||!uuid.test(item.product_id)||
   !Number.isInteger(item.quantity)||Number(item.quantity)<1||
   Number(item.quantity)>30||seen.has(item.product_id))return NextResponse.json(
   {error:'Item ou quantidade inválidos.'},{status:400,headers});
  seen.add(item.product_id);totalQty+=Number(item.quantity);
  items.push({product_id:item.product_id,quantity:Number(item.quantity)});
 }
 if(totalQty>30)return NextResponse.json({error:'Limite de 30 unidades por simulação.'},
  {status:400,headers});
 const token=process.env.MELHOR_ENVIO_SANDBOX_TOKEN?.trim();
 if(!token)return NextResponse.json({
  error:'Token MELHOR_ENVIO_SANDBOX_TOKEN não configurado no servidor.'
 },{status:503,headers});
 const {data:settings,error:settingsError}=await sb.from('shipping_origin_settings')
  .select('origin_postal_code').eq('id',1).maybeSingle();
 if(settingsError||!settings?.origin_postal_code)return NextResponse.json({
  error:'Cadastre o CEP de origem no painel de frete.'
 },{status:400,headers});
 const ids=items.map(i=>i.product_id);
 const {data:variants,error:variantError}=await sb.from('variants')
  .select('id,product_id,active,products(id,name,price_cents,active,is_adult),variant_shipping_specs(weight_g,width_cm,height_cm,length_cm)')
  .in('product_id',ids).eq('active',true);
 if(variantError)return NextResponse.json({error:'Falha ao validar dados de embalagem.'},
  {status:503,headers});
 const payloadProducts=[];
 for(const item of items){
  const matches=(variants??[]).filter(v=>v.product_id===item.product_id);
  if(matches.length!==1)return NextResponse.json({
   error:'Este produto não possui uma única variação ativa para cotação.'
  },{status:400,headers});
  const v=matches[0];
  const p=Array.isArray(v.products)?v.products[0]:v.products;
  if(!p||!p.active||p.is_adult||!Number.isInteger(p.price_cents)||
    p.price_cents<=0)return NextResponse.json({
   error:'Há produtos não disponíveis para frete.'
  },{status:400,headers});
  const raw=Array.isArray(v.variant_shipping_specs)?
   v.variant_shipping_specs[0]:v.variant_shipping_specs;
  if(!raw||!Number.isInteger(raw.weight_g)||raw.weight_g<=0||
   !Number.isInteger(raw.width_cm)||!Number.isInteger(raw.height_cm)||
   !Number.isInteger(raw.length_cm))return NextResponse.json({
   error:'Preencha peso e dimensões de todos os SKUs no painel de frete.'
  },{status:400,headers});
  payloadProducts.push({
   id:v.id,width:raw.width_cm,height:raw.height_cm,length:raw.length_cm,
   weight:Math.round((raw.weight_g/1000)*1000)/1000,
   insurance_value:Math.round((p.price_cents/100)*100)/100,
   quantity:item.quantity
  });
 }
 try{
  // Somente o endpoint de cálculo da Sandbox. Não compra etiquetas nem chama produção.
  const response=await fetch('https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate',{
   method:'POST',cache:'no-store',redirect:'error',
   signal:AbortSignal.timeout(10000),
   headers:{
    'Authorization':'Bearer '+token,'Content-Type':'application/json',
    'Accept':'application/json','User-Agent':'PopeBeauty (popebeauty.e@gmail.com)'
   },
   body:JSON.stringify({
    from:{postal_code:settings.origin_postal_code},
    to:{postal_code:input.postal_code},
    products:payloadProducts,options:{receipt:false,own_hand:false}
   })
  });
  if(!response.ok)return NextResponse.json({
   error:response.status===401||response.status===403?
    'Credenciais de sandbox rejeitadas pelo Melhor Envio.':
    'A cotação de sandbox não foi concluída (HTTP '+response.status+').'
  },{status:502,headers});
  const raw=await response.json() as unknown;
  if(!Array.isArray(raw))return NextResponse.json({
   error:'Resposta inesperada do Melhor Envio.'
  },{status:502,headers});
  const quotes=raw.flatMap((row:ProviderService)=>{
   if(!row||row.error)return [];
   const cents=priceCents(row.custom_price??row.price);
   const days=Number(row.custom_delivery_time??row.delivery_time);
   if(cents===null||!Number.isInteger(days)||days<0||days>180)return [];
   const service=typeof row.name==='string'?row.name.slice(0,80):'Serviço';
   const carrier=typeof row.company?.name==='string'?row.company.name.slice(0,80):'Transportadora';
   return [{
    service_id:String(row.id).slice(0,40),service,carrier,price_cents:cents,
    delivery_days:days
   }];
  }).sort((a,b)=>a.price_cents-b.price_cents);
  return NextResponse.json({
   sandbox:true,provider:'melhor_envio',quotes,
   notice:quotes.length?'Valores de sandbox para simulação; não constituem oferta de frete.':
    'A sandbox não retornou serviços cotáveis para esta combinação de CEP e produtos.',
   checkout_enabled:false
  },{headers});
 }catch{
  return NextResponse.json({
   error:'A API de sandbox está indisponível ou excedeu o tempo de resposta.'
  },{status:503,headers});
 }
}
