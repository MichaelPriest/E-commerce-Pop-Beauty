import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {processOrderNotificationQueue,smtpConfigured} from '@/lib/order-notification-mail';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){
 const origin=req.headers.get('origin');
 if(!origin||new URL(origin).host!==new URL(req.url).host)
  return NextResponse.json({error:'Origem não autorizada'},{status:403});
 const sb=await createClient();
 const {data:auth,error:authError}=await sb.auth.getClaims();
 if(authError||!auth?.claims?.sub)return NextResponse.json({error:'Sessão expirada'},{status:401});
 const {data:profile}=await sb.from('profiles').select('role').eq('id',auth.claims.sub).maybeSingle();
 if(profile?.role!=='admin')return NextResponse.json({error:'Somente administradores podem enviar notificações'},{status:403});
 let payload:Record<string,unknown>;
 try{payload=await req.json();}catch{return NextResponse.json({error:'JSON inválido'},{status:400});}
 try{
  if(payload.action==='retry'){
   if(typeof payload.notificationId!=='string'||!/^[0-9a-f-]{36}$/i.test(payload.notificationId))
    return NextResponse.json({error:'Identificador inválido'},{status:400});
   const {error}=await sb.rpc('retry_order_notification',{p_id:payload.notificationId});
   if(error)return NextResponse.json({error:error.message},{status:400});
  }else if(payload.action!=='process'){
   return NextResponse.json({error:'Ação não reconhecida'},{status:400});
  }
  const result=await processOrderNotificationQueue(sb,{
   notificationId:typeof payload.notificationId==='string'?payload.notificationId:undefined,
   max:payload.notificationId?1:3
  });
  return NextResponse.json({...result,configured:smtpConfigured()});
 }catch{
  return NextResponse.json({error:'Falha ao processar a fila. Verifique os logs do servidor.'},{status:500});
 }
}
