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

async function mpRequest(config: LiveConfig, path: string, preference?: object) {
  const response = await fetch(mercadoPagoApi + path, {
    method: preference ? 'POST' : 'GET', cache: 'no-store', redirect: 'error',
    signal: AbortSignal.timeout(8000),
    headers: {
      Authorization: 'Bearer ' + config.token, Accept: 'application/json',
      ...(preference ? {'Content-Type': 'application/json'} : {}),
    },
    body: preference ? JSON.stringify(preference) : undefined,
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
  config: LiveConfig, checkout: Extract<CommercialCheckoutClaim,{create: true}>,
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

export async function reconcileMpOrderPayment(
  config: LiveConfig, paymentId: string, expectedOrderId?: string,
): Promise<CommercialPaymentResult | 'unmatched'> {
  if (!commercialPaymentId.test(paymentId)) return 'unmatched';
  const payment = parseCommercialPaymentSnapshot(await mpRequest(config, '/v1/payments/' + paymentId));
  if (!payment || payment.id !== paymentId || String(payment.collectorId) !== config.sellerId) {
    return 'unmatched';
  }
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
