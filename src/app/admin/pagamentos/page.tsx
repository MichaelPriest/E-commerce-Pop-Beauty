import Link from 'next/link';
import {CreditCard,ShieldCheck,Clock3,ClipboardList,ArrowLeft,Webhook,AlertTriangle,CheckCircle2} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {SandboxPaymentPlanner} from './sandbox-payment-planner';
import type {SandboxPaymentAttempt,SandboxReservation} from './types';
import {sandboxPreferenceEnabled} from '@/lib/payments/mercado-pago-test';
import {mpTestWebhookEnabled} from '@/lib/payments/mp-webhook-test';
import {formatBRL} from '@/lib/products';
import {dateTimeBR} from '@/types/operations';

export const dynamic='force-dynamic';

export default async function SandboxPaymentsPage(){
 const sb=await requireAdmin();
 const [orders,attempts,receipts]=await Promise.all([
  sb.from('orders')
   .select('id,origin,status,total_cents,reservation_expires_at,created_at')
   .eq('origin','store_api').order('created_at',{ascending:false}).limit(100),
  sb.from('sandbox_payment_attempts')
   .select('id,order_id,provider,amount_cents,currency,environment,state,created_at,checkout_generation_state,provider_checkout_url')
   .order('created_at',{ascending:false}).limit(200),
  sb.from('payment_webhook_receipts')
   .select('id,external_event_id,provider_resource_id,provider_payment_status,provider_amount_cents,relation_status,signature_validated,live_mode,matched_attempt_id,received_at,verified_seller_id')
   .eq('provider','mercado_pago')
   .order('received_at',{ascending:false}).limit(100)
 ]);
 if(orders.error||attempts.error||receipts.error){
  return <div className="container admin-workspace"><h1>Pagamentos em homologação</h1>
   <p className="form-error" role="alert">{orders.error?.message||attempts.error?.message||receipts.error?.message}</p></div>;
 }
 const reservations=(orders.data??[]) as SandboxReservation[];
 const drafts=(attempts.data??[]) as SandboxPaymentAttempt[];
 const notifications=receipts.data??[];
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
  <section className="pope-sandbox-pay-panel">
   <div className="pope-sandbox-pay-header"><div>
    <h2><Webhook size={21}/> Webhooks Mercado Pago TEST</h2>
    <p>Conferência do status no provedor, sem baixa financeira ou liberação de pedidos.</p>
   </div>
    <span className={'pope-mp-webhook-status'+(mpTestWebhookEnabled()?' enabled':'')}>
     {mpTestWebhookEnabled()?
      <><CheckCircle2 size={15}/> Configurado para receber testes</>:
      <><AlertTriangle size={15}/> Desativado — faltam credenciais</>}
    </span>
   </div>
   <p className="ops-info">
    <ShieldCheck size={18}/>
    O webhook recebe somente eventos TEST assinados e consulta cada pagamento na API.
    Mesmo eventos com status <strong>approved</strong> são registrados apenas para auditoria.
    Não existe aprovação automática, captura de valor, envio de mercadoria ou alteração da receita.
   </p>
   <p className="admin-help">Endpoint exclusivo para testes:
    <code className="pope-mp-webhook-route">/api/webhooks/mercadopago/test</code>.
    Configure somente na URL de testes da integração Mercado Pago, após cadastrar
    <code>MP_TEST_WEBHOOK_SECRET</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code>,
    <code>MP_TEST_WEBHOOK_ENABLED</code> e as credenciais do vendedor TEST na Vercel.
   </p>
   <div className="ops-table-scroll"><table className="ops-table">
    <thead><tr><th>Recebimento</th><th>Evento</th><th>Pagamento MP</th><th>Status no provedor</th><th>Valor consultado</th><th>Vínculo da reserva</th></tr></thead>
    <tbody>{notifications.map(event=><tr key={event.id}>
     <td>{dateTimeBR(event.received_at)}</td>
     <td><strong>#{event.external_event_id}</strong></td>
     <td>{event.provider_resource_id??'—'}</td>
     <td><span className="ops-tag">{event.provider_payment_status??'—'}</span></td>
     <td>{event.provider_amount_cents!=null?formatBRL(Number(event.provider_amount_cents)):'—'}</td>
     <td><span className="ops-muted">
      {event.relation_status==='matched'?'Vínculo e subtotal conferidos':
       event.relation_status==='amount_mismatch'?'Valor divergente — revisar':
       event.relation_status==='inactive_reservation'?'Reserva encerrada/expirada':
       'Sem vínculo confirmado'}
     </span></td>
    </tr>)}</tbody>
   </table>
   {notifications.length===0?<div className="admin-empty">
    <Webhook size={33}/>
    <h3>Nenhuma notificação validada</h3>
    <p>Depois de configurar o ambiente TEST e executar um pagamento de homologação, eventos verificados aparecerão aqui.</p>
   </div>:null}
   </div>
  </section>
 </div>;
}
