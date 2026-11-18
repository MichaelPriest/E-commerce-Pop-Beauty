import {NextRequest} from 'next/server';
import {orderResponse,orderSession} from '@/lib/order-request';
import {processOrderNotificationQueue,smtpConfigured} from '@/lib/order-notification-mail';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){
 const session=await orderSession(req,true);
 if(session.error)return session.error;
 const sb=session.sb;
 let payload:Record<string,unknown>;
 try{payload=await req.json();}catch{return orderResponse({error:'JSON inválido'},400);}
 if(!payload||typeof payload!=='object')return orderResponse({error:'Solicitação inválida'},400);
 try{
  if(payload.action==='retry'){
   if(typeof payload.notificationId!=='string'||!/^[0-9a-f-]{36}$/i.test(payload.notificationId))
    return orderResponse({error:'Identificador inválido'},400);
   const {error}=await sb.rpc('retry_order_notification',{p_id:payload.notificationId});
   if(error)return orderResponse({error:error.message},400);
  }else if(payload.action!=='process'){
   return orderResponse({error:'Ação não reconhecida'},400);
  }
  const result=await processOrderNotificationQueue(sb,{
   notificationId:typeof payload.notificationId==='string'?payload.notificationId:undefined,
   max:payload.notificationId?1:3
  });
  return orderResponse({...result,configured:smtpConfigured()});
 }catch{
  return orderResponse({error:'Falha ao processar a fila. Verifique os logs do servidor.'},500);
 }
}
