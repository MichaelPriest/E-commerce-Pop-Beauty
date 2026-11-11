import Link from 'next/link';
import {CreditCard,ShieldCheck,Clock3,ClipboardList,ArrowLeft} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {SandboxPaymentPlanner} from './sandbox-payment-planner';
import type {SandboxPaymentAttempt,SandboxReservation} from './types';
import {sandboxPreferenceEnabled} from '@/lib/payments/mercado-pago-test';

export const dynamic='force-dynamic';

export default async function SandboxPaymentsPage(){
 const sb=await requireAdmin();
 const [orders,attempts]=await Promise.all([
  sb.from('orders')
   .select('id,origin,status,total_cents,reservation_expires_at,created_at')
   .eq('origin','store_api').order('created_at',{ascending:false}).limit(100),
  sb.from('sandbox_payment_attempts')
   .select('id,order_id,provider,amount_cents,currency,environment,state,created_at,checkout_generation_state,provider_checkout_url')
   .order('created_at',{ascending:false}).limit(200)
 ]);
 if(orders.error||attempts.error){
  return <div className="container admin-workspace"><h1>Pagamentos em homologação</h1>
   <p className="form-error" role="alert">{orders.error?.message||attempts.error?.message}</p></div>;
 }
 const reservations=(orders.data??[]) as SandboxReservation[];
 const drafts=(attempts.data??[]) as SandboxPaymentAttempt[];
 const active=reservations.filter(r=>r.status==='pending'&&
  !!r.reservation_expires_at&&new Date(r.reservation_expires_at).getTime()>Date.now());
 return <div className="container admin-workspace">
  <div className="admin-top"><div>
   <div className="section-kicker">PAGAMENTOS • AMBIENTE DE TESTES</div>
   <h1><CreditCard size={29}/> Preparação de pagamentos</h1>
   <p>Organize o teste de diferentes gateways sem criar uma cobrança ou concluir uma venda.</p>
  </div>
   <Link href="/admin/gateways" className="admin-outline"><ArrowLeft size={17}/> Central de gateways</Link>
  </div>
  <div className="admin-metric-row">
   <div><ClipboardList/><small>Preparações registradas</small><strong>{drafts.length}</strong></div>
   <div><Clock3/><small>Reservas ativas</small><strong>{active.length}</strong></div>
   <div><ShieldCheck/><small>Pagamentos confirmados</small><strong>0</strong></div>
   <div><CreditCard/><small>Transações reais executadas</small><strong>0</strong></div>
  </div>
  <p className="ops-info"><ShieldCheck size={18}/>
   A preparação inicial registra apenas um <strong>rascunho interno de sandbox</strong>.
   Com credenciais TEST verificadas, um botão separado pode gerar uma preferência Checkout Pro
   vinculada à conta vendedora de teste. Não é possível registrar pagamento aprovado
   ou liquidado nesta interface. Reservas vencem em 15 minutos.
  </p>
  <SandboxPaymentPlanner reservations={reservations} attempts={drafts} mpSandboxReady={sandboxPreferenceEnabled()}/>
 </div>;
}
