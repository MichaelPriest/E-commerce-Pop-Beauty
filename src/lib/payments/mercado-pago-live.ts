import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {checkoutAmountsMatch,mercadoPagoCheckoutAmounts,type CheckoutPaymentItem} from './checkout-amounts';
import {parseCommercialPaymentSnapshot,validatedMpCheckoutUrl} from './mp-payment-snapshot-core';
import type {CommercialPaymentResult} from './commercial-payment';

const mercadoPagoApi = 'https://api.mercadopago.com';
export const commercialPaymentId = /^[0-9]{1,24}$/;

export function mpLivePaymentConfig() {
  const token = process.env.MP_LIVE_ACCESS_TOKEN?.trim();
  const sellerId = process.env.MP_LIVE_SELLER_ID?.trim();
  const secret = process.env.MP_LIVE_WEBHOOK_SECRET?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (process.env.MP_LIVE_WEBHOOK_ENABLED !== 'verified-live-account-only' ||
      !token || !sellerId || !/^[1-9][0-9]{0,19}$/.test(sellerId) ||
      !secret || !serviceKey || !supabaseUrl || token.startsWith('TEST-') ||
      token === process.env.MP_TEST_ACCESS_TOKEN?.trim() ||
      sellerId === process.env.MP_TEST_SELLER_ID?.trim()) return null;
  let linkOrigin: string | null = null;
  if (process.env.MP_LIVE_PAYMENT_LINKS_ENABLED === 'internal-orders') {
    try {
      const site = new URL(process.env.MP_LIVE_SITE_ORIGIN ?? '');
      if (site.protocol === 'https:' && site.href === site.origin + '/') linkOrigin = site.origin;
    } catch { /* A origem pública precisa ser configurada para criar links. */ }
  }
  return {token,sellerId,secret,serviceKey,supabaseUrl,linkOrigin};
}

type LiveConfig = NonNullable<ReturnType<typeof mpLivePaymentConfig>>;

export function commercialPaymentStore(config: LiveConfig) {
  return createClient(config.supabaseUrl, config.serviceKey, {
    auth: {persistSession: false, autoRefreshToken: false},
  });
}

async function mpRequest(config: LiveConfig, path: string, body?: object, requestKey?: string) {
  const response = await fetch(mercadoPagoApi + path, {
    method: body ? 'POST' : 'GET', cache: 'no-store', redirect: 'error',
    signal: AbortSignal.timeout(8000),
    headers: {
      Authorization: 'Bearer ' + config.token, Accept: 'application/json',
      ...(body ? {'Content-Type': 'application/json'} : {}),
      ...(requestKey ? {'X-Idempotency-Key': requestKey} : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error('Não foi possível consultar o Mercado Pago.');
  return await response.json() as Record<string,unknown>;
}

export async function verifyMpLiveSeller(config: LiveConfig) {
  const account = await mpRequest(config, '/users/me');
  const sellerId = typeof account.id === 'string' || Number.isSafeInteger(account.id)
    ? String(account.id) : '';
  if (sellerId !== config.sellerId || account.site_id !== 'MLB' ||
      typeof account.nickname !== 'string' || !account.nickname || /^TEST/i.test(account.nickname)) {
    throw new Error('Conta vendedora comercial não reconhecida.');
  }
}

export type CommercialCheckoutClaim = {
  id: string;
  expires_at: string;
} & ({create: false; checkout_url: string | null} | {
  create: true;
  amount_cents: number;
  delivery_fee_cents: number;
  items: CheckoutPaymentItem[];
});

export async function createMpOrderPreference(
  config: LiveConfig, checkout: Extract<CommercialCheckoutClaim,{create: true}>, storefront=false,
) {
  const now = new Date();
  const expiry = new Date(checkout.expires_at);
  if (!config.linkOrigin || !Number.isFinite(expiry.getTime()) || expiry <= now ||
      !checkoutAmountsMatch(checkout.items,checkout.delivery_fee_cents,checkout.amount_cents)) {
    throw new Error('Dados do checkout indisponíveis.');
  }
  const preference = await mpRequest(config, '/checkout/preferences', {
    ...mercadoPagoCheckoutAmounts(checkout.items,checkout.delivery_fee_cents),
    external_reference: 'pope-order-payment:' + checkout.id,
    notification_url: config.linkOrigin + '/api/webhooks/mercadopago/orders',
    ...(storefront ? {back_urls:{success:config.linkOrigin+'/conta',
      pending:config.linkOrigin+'/conta',failure:config.linkOrigin+'/conta'},auto_return:'approved'} : {}),
    expires: true,
    expiration_date_from: now.toISOString(),
    expiration_date_to: expiry.toISOString(),
  });
  const url = validatedMpCheckoutUrl(preference.init_point);
  const preferenceId = preference.id;
  if (String(preference.collector_id) !== config.sellerId || !url ||
      typeof preferenceId !== 'string' || !/^[a-zA-Z0-9_-]{10,180}$/.test(preferenceId)) {
    throw new Error('Resposta de criação da preferência incompatível.');
  }
  return {preferenceId,url};
}

export async function prepareMpOrderLink(config:LiveConfig,orderId:string,actorId:string,storefront=false){
  if(!config.linkOrigin)return {status:503,error:'A criação de links está desativada.'} as const;
  try{await verifyMpLiveSeller(config);}
  catch{return {status:502,error:'Não foi possível validar a conta vendedora.'} as const;}
  const service=commercialPaymentStore(config);
  const {data,error}=await service.rpc('begin_commercial_order_payment',{
    p_order_id:orderId,p_seller_id:config.sellerId,p_actor_id:actorId,
  });
  if(error||!data)return {status:409,error:error?.code==='P0001'?error.message:'Pedido indisponível para pagamento.'} as const;
  const checkout=data as CommercialCheckoutClaim;
  if(!checkout.create){
    const url=validatedMpCheckoutUrl(checkout.checkout_url);
    return url?{status:200,checkout_url:url} as const:
      {status:409,error:'O link está em preparação. Acompanhe o pedido em sua conta.'} as const;
  }
  try{
    const preference=await createMpOrderPreference(config,checkout,storefront);
    const {error:finish}=await service.rpc('finish_commercial_order_payment',{
      p_checkout_id:checkout.id,p_preference_id:preference.preferenceId,p_checkout_url:preference.url,
    });
    if(finish)throw finish;
    return {status:200,checkout_url:preference.url} as const;
  }catch{return {status:502,error:'O provedor ainda não confirmou o link. Confira o pedido antes de repetir.'} as const;}
}

export async function reconcileMpOrderPayment(
  config: LiveConfig, paymentId: string, expectedOrderId?: string,
): Promise<CommercialPaymentResult | 'unmatched'> {
  const payment=await readMpOrderPayment(config,paymentId);
  if(!payment)return 'unmatched';
  const result=await applyMpOrderPayment(config,payment,expectedOrderId);
  if(result!=='unmatched'&&payment.status==='refunded'&&payment.refundedCents===payment.amountCents){
    const service=commercialPaymentStore(config);
    const {data:refund,error}=await service.from('store_order_refunds').select('order_id')
      .eq('payment_id',payment.id).eq('state','requested').maybeSingle();
    if(error)throw error;
    if(refund){
      const {error:finish}=await service.rpc('finish_store_order_refund',{p_order_id:refund.order_id,p_payment_id:payment.id});
      if(finish)throw finish;
    }
  }
  return result;
}

async function readMpOrderPayment(config:LiveConfig,paymentId:string){
  if(!commercialPaymentId.test(paymentId))return null;
  const payment=parseCommercialPaymentSnapshot(await mpRequest(config,'/v1/payments/'+paymentId));
  return payment?.id===paymentId&&String(payment.collectorId)===config.sellerId?payment:null;
}

async function applyMpOrderPayment(
  config:LiveConfig,payment:NonNullable<ReturnType<typeof parseCommercialPaymentSnapshot>>,expectedOrderId?:string,
){
  const {data,error} = await commercialPaymentStore(config).rpc('reconcile_commercial_order_payment', {
    p_checkout_id: payment.checkoutId,
    p_seller_id: config.sellerId,
    p_payment_id: payment.id,
    p_status: payment.status,
    p_currency: payment.currency,
    p_amount_cents: payment.amountCents,
    p_refunded_cents: payment.refundedCents,
    p_provider_updated_at: payment.updatedAt,
    p_approved_at: payment.approvedAt,
    p_expected_order_id: expectedOrderId ?? null,
  });
  if (error) throw error;
  return data as CommercialPaymentResult | 'unmatched';
}

export async function refundMpOrderPayment(config:LiveConfig,orderId:string,paymentId:string,reason:string,submit:boolean){
  const payment=await readMpOrderPayment(config,paymentId);
  if(!payment||await applyMpOrderPayment(config,payment,orderId)==='unmatched')return {status:404,error:'Pagamento sem vínculo com este pedido.'};
  const service=commercialPaymentStore(config);
  const fullRefund=payment.status==='refunded'&&payment.refundedCents===payment.amountCents;
  if(!submit&&!fullRefund)return {status:200,message:'O provedor ainda não confirmou o estorno total.'};
  const {data:refund,error}=await service.rpc('begin_store_order_refund',{
    p_order_id:orderId,p_payment_id:paymentId,p_reason:reason,p_seller_id:config.sellerId,
  }).single();
  if(error||!refund)return {status:409,error:error?.code==='P0001'?error.message:'Estorno indisponível.'};
  const claim=refund as {id:string;state:string;amount_cents:number;initial_refunded_cents:number};
  if(claim.state==='confirmed')return {status:200,message:'Estorno confirmado.'};

  if(!fullRefund){
    if(payment.status!=='approved'||payment.refundedCents!==claim.initial_refunded_cents||claim.amount_cents<=0){
      return {status:409,error:'O valor reembolsado mudou no provedor. Consulte o extrato e confira a operação.'};
    }
    const body=claim.initial_refunded_cents===0?{}:{amount:claim.amount_cents/100};
    await mpRequest(config,'/v1/payments/'+paymentId+'/refunds',body,claim.id);
    const latest=await readMpOrderPayment(config,paymentId);
    if(!latest)throw new Error('Estorno aguardando consulta.');
    await applyMpOrderPayment(config,latest,orderId);
  }
  const {data,error:finish}=await service.rpc('finish_store_order_refund',{p_order_id:orderId,p_payment_id:paymentId});
  if(finish)throw finish;
  return {status:data==='confirmed'?200:202,message:data==='confirmed'?'Estorno confirmado.':'Estorno solicitado. Consulte novamente para confirmar.'};
}
