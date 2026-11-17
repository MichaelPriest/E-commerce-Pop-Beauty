import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {hasSameOrigin} from '@/lib/order-request';
import {COMMERCIAL_PAYMENT_RESULTS} from '@/lib/payments/commercial-payment';
import {
  commercialPaymentId,mpLivePaymentConfig,prepareMpOrderLink,reconcileMpOrderPayment,refundMpOrderPayment,
} from '@/lib/payments/mercado-pago-live';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const headers = {'Cache-Control': 'private, no-store, max-age=0'};
const reject = (error: string, status: number) => NextResponse.json({error}, {status,headers});

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

  if(action==='refund'||action==='refund_status'){
    const reason='reason' in body&&typeof body.reason==='string'?body.reason.trim():'';
    if(typeof paymentId!=='string'||!commercialPaymentId.test(paymentId)||reason.length<3||reason.length>500)
      return reject('Confira o pagamento e informe o motivo do estorno.',400);
    try{
      const {status,...result}=await refundMpOrderPayment(config,orderId,paymentId,reason,action==='refund');
      return NextResponse.json(result,{status,headers});
    }catch{return reject('A confirmação do estorno ainda não está disponível. Consulte o pagamento antes de repetir.',502);}
  }

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
  const {status,...result}=await prepareMpOrderLink(config,orderId,actorId);
  return NextResponse.json(result,{status,headers});
}
