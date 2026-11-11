import 'server-only';

const idPattern=/^[0-9]{1,24}$/;

import {parsePaymentSnapshot} from './mp-payment-snapshot-core';
export {parsePaymentSnapshot} from './mp-payment-snapshot-core';
export type {MpPaymentSnapshot} from './mp-payment-snapshot-core';

export function mpTestWebhookEnabled(){
 return process.env.MP_TEST_WEBHOOK_ENABLED==='verified-test-account-only'
  && Boolean(process.env.MP_TEST_WEBHOOK_SECRET?.trim())
  && Boolean(process.env.MP_TEST_ACCESS_TOKEN?.trim())
  && /^[1-9][0-9]{3,20}$/.test(process.env.MP_TEST_SELLER_ID??'')
  && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
  && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
}

/** Somente leitura na API do provedor. Não confirma status financeiro no banco. */
export async function fetchMercadoPagoTestPayment(paymentId:string,token:string){
 if(!idPattern.test(paymentId))throw new Error('Identificador de pagamento inválido.');
 const response=await fetch('https://api.mercadopago.com/v1/payments/'+paymentId,{
  method:'GET',cache:'no-store',redirect:'error',
  signal:AbortSignal.timeout(7000),
  headers:{Authorization:'Bearer '+token,Accept:'application/json'}
 });
 if(!response.ok)throw new Error('Consulta autoritativa ao Mercado Pago não foi concluída.');
 const payment=parsePaymentSnapshot(await response.json());
 if(!payment||payment.id!==paymentId)throw new Error('Resposta de pagamento inconsistente.');
 return payment;
}
