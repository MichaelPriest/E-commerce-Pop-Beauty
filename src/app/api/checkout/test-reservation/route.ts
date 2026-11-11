import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {isSupabaseConfigured} from '@/lib/supabase/config';
export const runtime='nodejs';
export const dynamic='force-dynamic';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers={'Cache-Control':'no-store, private, max-age=0'};
export async function POST(request:NextRequest){
 const origin=request.headers.get('origin');
 let host='';
 try{host=origin?new URL(origin).host:'';}catch{}
 if(!host||host!==new URL(request.url).host){
  return NextResponse.json({error:'Origem não autorizada'},{status:403,headers});
 }
 if(!isSupabaseConfigured()){
  return NextResponse.json({error:'Catálogo indisponível'},{status:503,headers});
 }
 const sb=await createClient();
 const {data:claims,error:authError}=await sb.auth.getClaims();
 if(authError||!claims?.claims?.sub){
  return NextResponse.json({error:'Faça login para testar a reserva.'},{status:401,headers});
 }
 let payload:unknown;
 try{payload=await request.json();}catch{
  return NextResponse.json({error:'Dados inválidos'},{status:400,headers});
 }
 if(!payload||typeof payload!=='object')return NextResponse.json(
  {error:'Pedido inválido'},{status:400,headers});
 const b=payload as {address_id?:unknown;items?:unknown;request_key?:unknown};
 if(typeof b.address_id!=='string'||!uuid.test(b.address_id)||
    typeof b.request_key!=='string'||!uuid.test(b.request_key)||
    !Array.isArray(b.items)||b.items.length<1||b.items.length>10){
  return NextResponse.json({error:'Selecione endereço e até 10 produtos.'},{status:400,headers});
 }
 const seen=new Set<string>();
 const items:{product_id:string;quantity:number}[]=[];
 for(const item of b.items){
  if(!item||typeof item!=='object')return NextResponse.json(
   {error:'Produto inválido'},{status:400,headers});
  const value=item as {product_id?:unknown;quantity?:unknown};
  if(typeof value.product_id!=='string'||!uuid.test(value.product_id)||
     !Number.isInteger(value.quantity)||Number(value.quantity)<1||Number(value.quantity)>99||
     seen.has(value.product_id)){
   return NextResponse.json({error:'Verifique produtos e quantidades duplicadas.'},
    {status:400,headers});
  }
  seen.add(value.product_id);
  items.push({product_id:value.product_id,quantity:Number(value.quantity)});
 }
 try{
  const {data,error}=await sb.rpc('create_checkout_order',{
   p_address_id:b.address_id,p_items:items,p_request_key:b.request_key
  });
  if(error){
   const safe=error.message.match(/(Reservas de checkout estão disponíveis somente em homologação|Confirme seu e-mail|Endereço|Selecione|Estoque|Produto|variação|Já existe uma reserva de teste ativa|Limite de cinco reservas|Limite de 30 unidades|pedido de teste|Não disponível|não disponível|não encontrado)/i);
   return NextResponse.json({
    error:safe?error.message:'Não foi possível criar a reserva. Revise o carrinho.'
   },{status:400,headers});
  }
  const {data:order}=await sb.from('orders')
   .select('id,status,total_cents,reservation_expires_at,origin')
   .eq('id',data as string).eq('customer_id',claims.claims.sub).maybeSingle();
  if(!order||order.origin!=='store_api')return NextResponse.json({
   success:true,order_id:data,notice:'Reserva registrada. Consulte sua conta.'
  },{headers});
  return NextResponse.json({
   success:true,order_id:order.id,status:order.status,
   expires_at:order.reservation_expires_at,total_cents:order.total_cents,
   notice:'Reserva de HOMOLOGAÇÃO criada; sem cobrança, frete ou pedido confirmado.'
  },{headers});
 }catch{
  return NextResponse.json({error:'Falha na operação de reserva. Tente novamente.'},
   {status:503,headers});
 }
}
