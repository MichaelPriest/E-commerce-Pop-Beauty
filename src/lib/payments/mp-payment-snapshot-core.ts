const idPattern=/^[0-9]{1,24}$/;
const attemptPattern=/^pope-sandbox:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

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
 const amount=typeof p.transaction_amount==='number'||typeof p.transaction_amount==='string'?
  String(p.transaction_amount):'';
 if(!idPattern.test(paymentId)||!/^[-a-z_]{2,40}$/.test(status)||
  !/^\d{1,7}(?:\.\d{1,2})?$/.test(amount)||
  !Number.isSafeInteger(collectorId)||typeof p.live_mode!=='boolean')return null;
 const amountCents=Math.round(Number(amount)*100);
 if(!Number.isSafeInteger(amountCents)||amountCents<0||amountCents>500000000)return null;
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
