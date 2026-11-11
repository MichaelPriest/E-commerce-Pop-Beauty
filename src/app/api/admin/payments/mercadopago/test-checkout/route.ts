import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {sandboxPreferenceEnabled,verifyMercadoPagoTestSeller,createMpTestPreference}
 from '@/lib/payments/mercado-pago-test';

export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store, max-age=0'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reject=(message:string,status:number)=>NextResponse.json({error:message},{status,headers});

export async function POST(request:NextRequest){
 const origin=request.headers.get('origin');
 let host='';
 try{host=origin?new URL(origin).host:'';}catch{}
 if(!host||host!==new URL(request.url).host)return reject('Origem não autorizada.',403);
 const sb=await createClient();
 const {data:auth,error:authError}=await sb.auth.getClaims();
 if(authError||!auth?.claims?.sub)return reject('Sessão necessária.',401);
 const {data:profile}=await sb.from('profiles').select('role')
  .eq('id',auth.claims.sub).maybeSingle();
 if(profile?.role!=='admin')return reject('Apenas administradores podem testar pagamentos.',403);
 // A ausência de qualquer uma das três configurações encerra a requisição sem chamar o provedor.
 if(!sandboxPreferenceEnabled())return reject(
  'Ambiente Mercado Pago TEST não habilitado. Configure credencial TEST, ID do vendedor de teste e liberação explícita no servidor.',503);
 let body:unknown;
 try{body=await request.json();}catch{return reject('Requisição inválida.',400);}
 const id=body&&typeof body==='object'&&'attempt_id' in body?
  (body as {attempt_id:unknown}).attempt_id:null;
 if(typeof id!=='string'||!uuid.test(id))return reject('Tentativa de sandbox inválida.',400);
 const {data:attempt,error:attemptError}=await sb.from('sandbox_payment_attempts')
  .select('id,order_id,provider,state,amount_cents,checkout_generation_state')
  .eq('id',id).maybeSingle();
 if(attemptError||!attempt||attempt.provider!=='mercado_pago'||attempt.state!=='draft'){
  return reject('Preparação Mercado Pago indisponível.',400);
 }
 if(attempt.checkout_generation_state!=='not_started'){
  return reject('Esta tentativa já iniciou a criação de um checkout. Não é permitido repetir.',409);
 }
 const {data:order,error:orderError}=await sb.from('orders')
  .select('id,status,origin,total_cents,reservation_expires_at,order_items(sku_snapshot,title_snapshot,quantity,unit_price_cents)')
  .eq('id',attempt.order_id).maybeSingle();
 if(orderError||!order||order.status!=='pending'||order.origin!=='store_api'||
  !order.reservation_expires_at||
  new Date(order.reservation_expires_at).getTime()<Date.now()+60000||
  order.total_cents!==attempt.amount_cents){
  return reject('Reserva sem validade para criar um link de teste.',409);
 }
 const items=order.order_items??[];
 if(!items.length||items.length>10||items.some(i=>
   !Number.isInteger(i.unit_price_cents)||i.unit_price_cents<=0||
   !Number.isInteger(i.quantity)||i.quantity<1||i.quantity>30)){
  return reject('Produtos da reserva inválidos.',400);
 }
 const price=items.reduce((sum,i)=>sum+i.unit_price_cents*i.quantity,0);
 if(price!==order.total_cents)return reject('Subtotal inconsistente; nenhum checkout foi criado.',409);
 let verified;
 try{verified=await verifyMercadoPagoTestSeller();}
 catch(e){return reject(e instanceof Error?e.message:'Conta TEST não validada.',403);}
 // O claim no PostgreSQL bloqueia requisições concorrentes; a primeira recebe o direito exclusivo de criar.
 const {error:claimError}=await sb.rpc('begin_mp_test_checkout',{p_attempt_id:id});
 if(claimError)return reject('Não foi possível iniciar este teste: '+claimError.message,409);
 try{
  const created=await createMpTestPreference({
   ...verified,attemptId:id,orderId:order.id,expiresAt:order.reservation_expires_at,
   items:items.map(i=>({
    sku:i.sku_snapshot,title:i.title_snapshot,quantity:i.quantity,
    priceCents:i.unit_price_cents
   }))
  });
  const {error:completeError}=await sb.rpc('finish_mp_test_checkout',{
   p_attempt_id:id,p_preference_id:created.id,p_checkout_url:created.init_point
  });
  if(completeError)throw new Error('Checkout remoto criado, mas o registro local não foi confirmado. Não tente repetir: '+completeError.message);
  return NextResponse.json({
   success:true,checkout_url:created.init_point,expires_at:order.reservation_expires_at,
   environment:'sandbox',provider:'mercado_pago',
   warning:'Abra somente com uma CONTA DE TESTE COMPRADOR. Nenhum pagamento do pedido será confirmado automaticamente.'
  },{headers});
 }catch(e){
  // Falhas após início permanecem PREPARING: não repetimos chamadas externas sem conciliação.
  return reject(e instanceof Error?e.message:'Falha ao preparar o checkout TEST.',502);
 }
}
