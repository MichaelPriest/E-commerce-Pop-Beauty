import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {COMMERCIAL_PAYMENT_RESULTS} from '@/lib/payments/commercial-payment';
import {
  commercialPaymentId,commercialPaymentStore,createMpOrderPreference,mpLivePaymentConfig,
  reconcileMpOrderPayment,verifyMpLiveSeller,type CommercialCheckoutClaim,
} from '@/lib/payments/mercado-pago-live';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const headers = {'Cache-Control': 'private, no-store, max-age=0'};
const reject = (error: string, status: number) => NextResponse.json({error}, {status,headers});

function hasSameOrigin(request: NextRequest) {
  const header = request.headers.get('origin');
  if (!header) return false;
  try {
    const origin = new URL(header);
    return header === origin.origin && origin.protocol === request.nextUrl.protocol &&
      origin.host === request.headers.get('host')?.toLowerCase();
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return reject('Origem não autorizada.',403);
  }
  const config = mpLivePaymentConfig();
  if (!config) return reject('A integração comercial está desativada.',503);

  const sb = await createClient();
  const {data:auth,error:authError} = await sb.auth.getClaims();
  const actorId = auth?.claims?.sub;
  if (authError || !actorId) return reject('Sessão necessária.',401);
  const {data:profile,error:profileError} = await sb.from('profiles').select('role').eq('id',actorId).maybeSingle();
  if (profileError || profile?.role !== 'admin') return reject('Acesso restrito à administração.',403);

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reject('Dados inválidos.',400);
  const {order_id:orderId,action,payment_id:paymentId} = body as Record<string,unknown>;
  if (typeof orderId !== 'string' || !uuid.test(orderId)) return reject('Pedido inválido.',400);

  if (action === 'reconcile') {
    if (typeof paymentId !== 'string' || !commercialPaymentId.test(paymentId)) {
      return reject('Informe o ID numérico do pagamento do Mercado Pago.',400);
    }
    try {
      const result = await reconcileMpOrderPayment(config,paymentId,orderId);
      if (result === 'unmatched') return reject('Pagamento sem vínculo com este pedido.',404);
      return NextResponse.json({message: COMMERCIAL_PAYMENT_RESULTS[result]},{headers});
    } catch {
      return reject('A consulta ao provedor falhou. Tente novamente.',502);
    }
  }
  if (action !== 'link') return reject('Operação inválida.',400);
  if (!config.linkOrigin) return reject('A criação de links está desativada.',503);

  try { await verifyMpLiveSeller(config); }
  catch { return reject('Não foi possível validar a conta vendedora do Mercado Pago.',502); }

  const service = commercialPaymentStore(config);
  const {data,error} = await service.rpc('begin_commercial_order_payment', {
    p_order_id: orderId, p_seller_id: config.sellerId, p_actor_id: actorId,
  });
  if (error || !data) {
    return reject(error?.code === 'P0001' ? error.message : 'Não foi possível preparar este pedido.',409);
  }
  const checkout = data as CommercialCheckoutClaim;
  if (!checkout.create) {
    if (!checkout.checkout_url) return reject('Preparação em andamento. Consulte o pedido novamente.',409);
    return NextResponse.json({checkout_url:checkout.checkout_url},{headers});
  }
  try {
    const preference = await createMpOrderPreference(config,checkout);
    const {error:finishError} = await service.rpc('finish_commercial_order_payment', {
      p_checkout_id: checkout.id, p_preference_id: preference.preferenceId, p_checkout_url: preference.url,
    });
    if (finishError) throw finishError;
    return NextResponse.json({checkout_url:preference.url},{headers});
  } catch {
    // An uncertain provider timeout leaves this claim in place until the preference expires.
    return reject('O link ainda não foi confirmado. Confira a preparação no pedido.',502);
  }
}
