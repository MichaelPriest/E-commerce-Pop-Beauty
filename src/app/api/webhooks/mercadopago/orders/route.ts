import {NextRequest,NextResponse} from 'next/server';
import {verifyMpWebhookSignature} from '@/lib/payments/mp-webhook-signature';
import {commercialPaymentId,mpLivePaymentConfig,reconcileMpOrderPayment} from '@/lib/payments/mercado-pago-live';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function respond(status: number) {
  return new NextResponse(null,{status,headers:{'Cache-Control':'private, no-store, max-age=0'}});
}

export async function POST(request: NextRequest) {
  const config = mpLivePaymentConfig();
  if (!config) return respond(503);
  const ids = request.nextUrl.searchParams.getAll('data.id');
  const types = request.nextUrl.searchParams.getAll('type');
  if (ids.length !== 1 || types.length !== 1) return respond(400);
  const [paymentId] = ids;
  if (!verifyMpWebhookSignature({
    signature: request.headers.get('x-signature'), requestId: request.headers.get('x-request-id'),
    dataId: paymentId, secret: config.secret,
  })) return respond(401);
  if (types[0] !== 'payment') return respond(200);
  if (!commercialPaymentId.test(paymentId)) return respond(400);

  try {
    // Payment status and amounts come exclusively from the authenticated provider API.
    await reconcileMpOrderPayment(config,paymentId);
    return respond(200);
  } catch {
    return respond(503);
  }
}
