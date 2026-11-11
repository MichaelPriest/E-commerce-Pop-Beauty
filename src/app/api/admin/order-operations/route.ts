import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {processOrderNotificationQueue} from '@/lib/order-notification-mail';
export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(req:NextRequest){
 const origin=req.headers.get('origin');
 if(!origin||new URL(origin).host!==new URL(req.url).host)
  return NextResponse.json({error:'Origem não autorizada'},{status:403});
 const sb=await createClient();
 const {data:auth,error:authError}=await sb.auth.getClaims();
 if(authError||!auth?.claims?.sub)return NextResponse.json({error:'Sessão expirada'},{status:401});
 const {data:profile,error:profileError}=await sb.from('profiles').select('role').eq('id',auth.claims.sub).maybeSingle();
 if(profileError||profile?.role!=='admin')return NextResponse.json({error:'Acesso restrito ao administrador'},{status:403});
 let payload:Record<string,unknown>;
 try{payload=await req.json();}catch{return NextResponse.json({error:'Corpo inválido'},{status:400});}
 let orderId:string|undefined;
 if(payload.action==='create'){
  if(!Array.isArray(payload.items)||payload.items.length<1||payload.items.length>30)
   return NextResponse.json({error:'Quantidade de itens inválida'},{status:400});
  const items=payload.items.filter((x):x is {variant_id:string;quantity:number}=>
   !!x&&typeof x==='object'&&typeof x.variant_id==='string'&&
   /^[0-9a-f-]{36}$/i.test(x.variant_id)&&Number.isInteger(x.quantity)&&x.quantity>=1&&x.quantity<=99);
  if(items.length!==payload.items.length)return NextResponse.json({error:'SKU ou quantidade inválidos'},{status:400});
  const customerId=typeof payload.customerId==='string'&&payload.customerId?payload.customerId:null;
  const {data,error}=await sb.rpc('create_admin_order',{p_customer_id:customerId,p_items:items});
  if(error)return NextResponse.json({error:error.message},{status:400});
  orderId=data as string;
 }else if(payload.action==='transition'){
  const next=payload.nextStatus;
  if(typeof payload.orderId!=='string'||!['paid','packing','shipped','delivered','cancelled'].includes(String(next)))
   return NextResponse.json({error:'Status ou pedido inválido'},{status:400});
  const {error}=await sb.rpc('transition_admin_order',{
   p_order_id:payload.orderId,p_next_status:next,
   p_note:typeof payload.note==='string'?payload.note:null,
   p_carrier:typeof payload.carrier==='string'?payload.carrier:null,
   p_tracking_code:typeof payload.tracking==='string'?payload.tracking:null
  });
  if(error)return NextResponse.json({error:error.message},{status:400});
  orderId=payload.orderId;
 }else{
  return NextResponse.json({error:'Operação desconhecida'},{status:400});
 }
 try{
  const email=await processOrderNotificationQueue(sb,{orderId,max:1});
  return NextResponse.json({success:true,orderId,email});
 }catch{
  // A alteração do pedido foi confirmada no banco; o envio pode ser reprocessado.
  return NextResponse.json({success:true,orderId,email:{configured:false,sent:0,failed:0,
   notice:'Pedido gravado. Não foi possível processar o aviso agora; consulte a fila.'}});
 }
}
