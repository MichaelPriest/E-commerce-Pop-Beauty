const idPattern=/^[0-9]{1,24}$/;
const attemptPattern=/^pope-sandbox:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const commercialPattern=/^pope-order-payment:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export type MpPaymentSnapshot={
 id:string;status:string;amountCents:number;
 currency:string;collectorId:number;liveMode:boolean;
 attemptId:string|null;metadataAttemptId:string|null;
};

export function mpTestWebhookEnabled(){
 return process.env.MP_TEST_WEBHOOK_ENABLED==='verified-test-account-only'
  && Boolean(process.env.MP_TEST_WEBHOOK_SECRET?.trim())
  && Boolean(process.env.MP_TEST_ACCESS_TOKEN?.trim())
  && /^[1-9][0-9]{3,20}$/.test(process.env.MP_TEST_SELLER_ID??'')
  && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
  && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
}

export function parsePaymentSnapshot(value:unknown):MpPaymentSnapshot|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const p=value as Record<string,unknown>;
 const paymentId=typeof p.id==='string'?p.id:
  Number.isSafeInteger(p.id)?String(p.id):'';
 const status=typeof p.status==='string'?p.status:'';
 const currency=typeof p.currency_id==='string'?p.currency_id:'';
 const collectorId=Number(p.collector_id);
 const amountCents=paymentCents(p.transaction_amount);
 if(!idPattern.test(paymentId)||!/^[-a-z_]{2,40}$/.test(status)||
  amountCents===null||
  !Number.isSafeInteger(collectorId)||typeof p.live_mode!=='boolean')return null;
 const reference=typeof p.external_reference==='string'?p.external_reference:'';
 const matched=attemptPattern.exec(reference);
 const metadata=p.metadata&&typeof p.metadata==='object'&&!Array.isArray(p.metadata)?
  p.metadata as Record<string,unknown>:null;
 const metadataAttemptId=typeof metadata?.pope_attempt_id==='string'?
  metadata.pope_attempt_id:null;
 return {
  id:paymentId,status,amountCents,currency,collectorId,
  liveMode:p.live_mode,attemptId:matched?.[1]??null,metadataAttemptId
 };
}

function paymentCents(value:unknown):number|null{
 const amount=typeof value==='number'||typeof value==='string'?String(value):'';
 if(!/^\d{1,7}(?:\.\d{1,2})?$/.test(amount))return null;
 const cents=Math.round(Number(amount)*100);
 return cents<=500000000?cents:null;
}

function paymentTime(value:unknown):string|null{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(value))return null;
 const time=Date.parse(value);
 return Number.isFinite(time)?new Date(time).toISOString():null;
}

export function parseCommercialPaymentSnapshot(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Resposta de pagamento inválida.');
 const p=value as Record<string,unknown>;
 const reference=typeof p.external_reference==='string'?p.external_reference:'';
 const checkoutId=commercialPattern.exec(reference)?.[1]??null;
 if(p.live_mode===false||!checkoutId)return null;
 const snapshot=parsePaymentSnapshot(value);
 if(!snapshot||!/^[A-Z]{3}$/.test(snapshot.currency))throw new Error('Resposta de pagamento inválida.');
 const refundedCents=paymentCents(p.transaction_amount_refunded);
 const updatedAt=paymentTime(p.date_last_updated);
 const approvedAt=paymentTime(p.date_approved);
 if(refundedCents===null||refundedCents>snapshot.amountCents||!updatedAt||
    (p.date_approved!=null&&!approvedAt))throw new Error('Dados de conciliação indisponíveis.');
 const {id,status,currency,amountCents,collectorId}=snapshot;
 return {id,status,currency,amountCents,collectorId,checkoutId,refundedCents,updatedAt,approvedAt};
}

export function validatedMpCheckoutUrl(value:unknown):string|null{
 if(typeof value!=='string'||value.length>2000)return null;
 try{
  const url=new URL(value);
  if(url.protocol==='https:'&&!url.port&&!url.username&&!url.password&&
     ['mercadopago.com','www.mercadopago.com','mercadopago.com.br','www.mercadopago.com.br'].includes(url.hostname)){
   return url.href;
  }
 }catch{/* Preferência inválida. */}
 return null;
}
