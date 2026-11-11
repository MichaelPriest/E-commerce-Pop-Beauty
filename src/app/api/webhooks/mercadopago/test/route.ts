import {NextRequest,NextResponse} from 'next/server';
import {createClient as createServiceClient} from '@supabase/supabase-js';
import {mpTestWebhookEnabled,fetchMercadoPagoTestPayment}
 from '@/lib/payments/mp-webhook-test';
import {verifyMpWebhookSignature,webhookPayloadSha256}
 from '@/lib/payments/mp-webhook-signature';
import {verifyMercadoPagoTestSellerCredentials} from '@/lib/payments/mercado-pago-test';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const noStore={'Cache-Control':'no-store, private, max-age=0'};
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(status:number){return new NextResponse(null,{status,headers:noStore});}

export async function POST(request:NextRequest){
 // Nenhum evento é aceito antes de configuração manual do ambiente TEST.
 // Não reutilizar esta rota como webhook de produção.
 if(!mpTestWebhookEnabled())return fail(503);
 if(!request.headers.get('content-type')?.toLowerCase().includes('application/json'))return fail(415);

 const url=new URL(request.url);
 const ids=url.searchParams.getAll('data.id');
 const types=url.searchParams.getAll('type');
 if(ids.length!==1||types.length!==1||!ids[0]||ids[0].length>80)return fail(400);
 const secret=process.env.MP_TEST_WEBHOOK_SECRET!;
 if(!verifyMpWebhookSignature({
  signature:request.headers.get('x-signature'),
  requestId:request.headers.get('x-request-id'),
  dataId:ids[0],secret
 }))return fail(401);

 let raw:string;
 try{raw=await request.text();}catch{return fail(400);}
 if(Buffer.byteLength(raw,'utf8')>16384)return fail(413);
 let body:unknown;
 try{body=JSON.parse(raw);}catch{return fail(400);}
 if(!body||typeof body!=='object'||Array.isArray(body))return fail(400);
 const event=body as Record<string,unknown>;
 const bodyData=event.data&&typeof event.data==='object'&&!Array.isArray(event.data)?
  event.data as Record<string,unknown>:null;
 const resourceId=typeof bodyData?.id==='string'?bodyData.id:
  Number.isSafeInteger(bodyData?.id)?String(bodyData.id):'';
 if(resourceId.toLowerCase()!==ids[0].toLowerCase())return fail(400);
 if(types[0]!==event.type)return fail(400);
 // A integração é apenas para PAYMENT; outros tópicos assinados não mudam a loja.
 if(types[0]!=='payment')return new NextResponse(null,{status:200,headers:noStore});
 if(!/^[0-9]{1,24}$/.test(resourceId))return fail(400);
 if(event.live_mode!==false)return fail(403);
 const eventId=typeof event.id==='string'?event.id:
  Number.isSafeInteger(event.id)?String(event.id):'';
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(eventId))return fail(400);
 const expectedSeller=Number(process.env.MP_TEST_SELLER_ID);
 if(event.user_id!==undefined&&Number(event.user_id)!==expectedSeller)return fail(403);

 try{
  // Fonte de verdade: vendedor autenticado + GET do pagamento, não o JSON recebido.
  const verified=await verifyMercadoPagoTestSellerCredentials();
  if(verified.seller.id!==expectedSeller)return fail(403);
  const payment=await fetchMercadoPagoTestPayment(resourceId,verified.token);
  if(payment.collectorId!==verified.seller.id||payment.liveMode!==false)return fail(403);
  if(payment.currency!=='BRL')return fail(403);

  const supabase=createServiceClient(
   process.env.NEXT_PUBLIC_SUPABASE_URL!,
   process.env.SUPABASE_SERVICE_ROLE_KEY!,
   {auth:{persistSession:false,autoRefreshToken:false}}
  );
  let relationStatus:'matched'|'unknown_reference'|'amount_mismatch'|'inactive_reservation'=
   'unknown_reference';
  let matchedAttemptId:string|null=null;
  if(payment.attemptId&&uuidPattern.test(payment.attemptId)&&
   (!payment.metadataAttemptId||payment.metadataAttemptId===payment.attemptId)){
   const {data:attempt,error:attemptError}=await supabase
    .from('sandbox_payment_attempts')
    .select('id,order_id,provider,amount_cents,state,checkout_generation_state')
    .eq('id',payment.attemptId).maybeSingle();
   if(attemptError)throw attemptError;
   if(attempt&&attempt.provider==='mercado_pago'&&
       attempt.checkout_generation_state==='ready'){
    matchedAttemptId=attempt.id;
    if(attempt.amount_cents!==payment.amountCents)relationStatus='amount_mismatch';
    else{
     const {data:order,error:orderError}=await supabase.from('orders')
      .select('id,origin,status,reservation_expires_at,total_cents')
      .eq('id',attempt.order_id).maybeSingle();
     if(orderError)throw orderError;
     if(!order||order.origin!=='store_api'||order.total_cents!==attempt.amount_cents)
      relationStatus='unknown_reference';
     else if(order.status!=='pending'||attempt.state!=='draft'||
      !order.reservation_expires_at||
      new Date(order.reservation_expires_at).getTime()<=Date.now())
      relationStatus='inactive_reservation';
     else relationStatus='matched';
    }
   }
  }
  const {error:insertError}=await supabase.from('payment_webhook_receipts')
   .upsert({
    provider:'mercado_pago',
    external_event_id:eventId,
    payload_sha256:webhookPayloadSha256(raw),
    signature_validated:true,
    processed_at:new Date().toISOString(),
    provider_resource_id:payment.id,
    matched_attempt_id:matchedAttemptId,
    provider_payment_status:payment.status,
    provider_currency:payment.currency,
    provider_amount_cents:payment.amountCents,
    relation_status:relationStatus,
    live_mode:payment.liveMode,
    verified_seller_id:String(verified.seller.id)
   },{onConflict:'provider,external_event_id',ignoreDuplicates:true});
  if(insertError)throw insertError;
  // Esta é uma conferência de sandbox e NÃO confirma pagamentos na Popê Beauty.
  // Mesmo status APPROVED é somente um dado de auditoria; não altera orders.
  return new NextResponse(null,{status:200,headers:noStore});
 }catch{
  // Erros de API/BD podem ser tentados novamente pelo Mercado Pago.
  // Nunca retornar 200 quando uma notificação válida falhou ao ser gravada.
  return fail(503);
 }
}
