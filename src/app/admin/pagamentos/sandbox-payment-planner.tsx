'use client';
import {useMemo,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {ShieldCheck,ClipboardList,Clock3,AlertTriangle,RefreshCcw,FileCheck,ExternalLink} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {PAYMENT_GATEWAYS} from '@/lib/payment-gateways';
import {formatBRL} from '@/lib/products';
import {dateTimeBR} from '@/types/operations';
import type {SandboxPaymentAttempt,SandboxReservation} from './types';

const allowed=PAYMENT_GATEWAYS.filter(g=>g.sandbox==='available');

export function SandboxPaymentPlanner({reservations,attempts,mpSandboxReady}:{
 reservations:SandboxReservation[];attempts:SandboxPaymentAttempt[];
 mpSandboxReady:boolean;
}){
 const router=useRouter();
 const [orderId,setOrderId]=useState(''),[provider,setProvider]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const [checkoutBusy,setCheckoutBusy]=useState<string|null>(null);
 const [createdUrl,setCreatedUrl]=useState<string|null>(null);
 const idempotency=useRef<string|null>(null);
 const available=useMemo(()=>reservations.filter(r=>
  r.status==='pending'&&!!r.reservation_expires_at&&
  new Date(r.reservation_expires_at).getTime()>Date.now()&&
  !attempts.some(a=>a.order_id===r.id&&a.state==='draft')), [reservations,attempts]);
 const selected=available.find(o=>o.id===orderId);
 async function prepare(){
  if(busy||!selected||!provider||!allowed.some(p=>p.id===provider))return;
  setBusy(true);setError('');setSuccess('');
  try{
   if(!idempotency.current)idempotency.current=crypto.randomUUID();
   const {data,error:rpcError}=await createClient().rpc('plan_sandbox_payment_attempt',{
    p_order_id:selected.id,p_provider:provider,p_idempotency_key:idempotency.current
   });
   if(rpcError)throw rpcError;
   setSuccess('Preparação registrada (#'+String(data).slice(0,8).toUpperCase()+'). Nenhuma cobrança foi criada.');
   setOrderId('');setProvider('');idempotency.current=null;
   router.refresh();
  }catch(e){
   setError(e instanceof Error?e.message:'Falha ao preparar a simulação.');
  }finally{setBusy(false);}
 }
 async function createMercadoPagoTestCheckout(attemptId:string){
  if(checkoutBusy||!mpSandboxReady)return;
  if(!window.confirm('Este teste gerará uma preferência no Mercado Pago, usando somente a conta vendedora TEST previamente validada. Use APENAS uma conta compradora de teste. Continuar?'))return;
  setCheckoutBusy(attemptId);setError('');setSuccess('');setCreatedUrl(null);
  try{
   const response=await fetch('/api/admin/payments/mercadopago/test-checkout',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({attempt_id:attemptId}),cache:'no-store'
   });
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||'Não foi possível criar o checkout de testes.');
   setCreatedUrl(data.checkout_url);
   setSuccess('Link de checkout TEST criado. Use exclusivamente o usuário COMPRADOR de teste. Nenhum pedido foi marcado como pago.');
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Erro ao gerar checkout de testes.');}
  finally{setCheckoutBusy(null);}
 }
 function updateOrder(value:string){setOrderId(value);idempotency.current=null;setSuccess('');setError('');}
 function updateProvider(value:string){setProvider(value);idempotency.current=null;setSuccess('');setError('');}
 return <>
  <section className="pope-sandbox-pay-panel">
   <div className="pope-sandbox-pay-header"><div><h2><ClipboardList size={20}/> Registrar preparação</h2>
    <p>Selecione uma reserva de homologação vigente e um gateway com sandbox documentado.</p></div>
    <Link href="/admin/reservas" className="admin-outline"><Clock3 size={16}/> Reservas de teste</Link>
   </div>
   <div className="pope-sandbox-pay-form">
    <label>Reserva de teste
     <select value={orderId} onChange={e=>updateOrder(e.target.value)} disabled={busy}>
      <option value="">Escolha uma reserva ativa</option>
      {available.map(r=><option key={r.id} value={r.id}>
       #{r.id.slice(0,8).toUpperCase()} · {formatBRL(r.total_cents)}
      </option>)}
     </select>
    </label>
    <label>Gateway para homologação
     <select value={provider} onChange={e=>updateProvider(e.target.value)} disabled={busy}>
      <option value="">Escolha um provedor</option>
      {allowed.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
     </select>
    </label>
    <button type="button" className="admin-primary" onClick={prepare}
     disabled={busy||!selected||!provider}>
     <FileCheck size={16}/>{busy?'Registrando...':'Preparar teste'}
    </button>
   </div>
   {selected?<div className="pope-sandbox-pay-summary"><strong>Subtotal validado: {formatBRL(selected.total_cents)}</strong>
    <span>Reserva até {selected.reservation_expires_at?dateTimeBR(selected.reservation_expires_at):'—'}</span>
    <span>Frete ainda não incluído; valor final não definido.</span>
   </div>:null}
   {!available.length?<p className="pope-sandbox-pay-empty"><AlertTriangle size={17}/>
    Nenhuma reserva disponível. Para preparar um teste, crie uma reserva válida em
    <Link href="/checkout"> Conferência do checkout</Link> usando uma conta administradora.</p>:null}
   {error?<p role="alert" className="form-error">{error}</p>:null}
   {success?<p role="status" className="form-success">{success}</p>:null}
   {createdUrl?<p className="pope-mp-test-link">
    <ExternalLink size={16}/>
    <a href={createdUrl} target="_blank" rel="noopener noreferrer">Abrir checkout Mercado Pago da conta TEST</a>
   </p>:null}
  </section>
  <section className="pope-sandbox-pay-panel">
   <div className="pope-sandbox-pay-header">
    <div><h2><RefreshCcw size={20}/> Histórico de preparações</h2>
     <p>Preparações expiradas ou canceladas não representam transações financeiras.</p></div>
   </div>
   <p className="pope-mp-test-warning">
    <ShieldCheck size={17}/> Mercado Pago Checkout Pro: {mpSandboxReady?
    'configuração de sandbox presente; antes da criação, o servidor verificará a conta vendedora TEST e o valor da reserva.':
    'ainda não habilitado. Configure MP_TEST_ACCESS_TOKEN, MP_TEST_SELLER_ID e MP_TEST_PREFERENCE_CREATION_ENABLED no servidor.'}
    Mesmo em testes, o botão não deve ser usado com contas pessoais de comprador.
    A loja não recebe webhooks financeiros nesta fase.
   </p>
   <div className="ops-table-scroll"><table className="ops-table">
    <thead><tr><th>Registrado</th><th>Reserva</th><th>Gateway</th><th>Valor dos itens</th><th>Ambiente</th><th>Estado</th><th>Checkout TEST</th></tr></thead>
    <tbody>{attempts.map(a=><tr key={a.id}>
     <td>{dateTimeBR(a.created_at)}</td>
     <td>#{a.order_id.slice(0,8).toUpperCase()}</td>
     <td>{PAYMENT_GATEWAYS.find(g=>g.id===a.provider)?.name??a.provider}</td>
     <td>{formatBRL(a.amount_cents)}</td><td><span className="ops-tag">Sandbox</span></td>
     <td>{a.state==='draft'?'Preparação (sem cobrança)':a.state==='expired'?'Expirada':'Cancelada'}</td>
     <td>{a.provider==='mercado_pago'&&a.state==='draft'?(
       a.checkout_generation_state==='ready'&&a.provider_checkout_url?
        <a className="admin-outline" target="_blank" rel="noopener noreferrer" href={a.provider_checkout_url}>
         <ExternalLink size={14}/> Abrir link TEST</a>:
       a.checkout_generation_state==='preparing'?
        <span className="ops-muted">Criação iniciada. Não repetir.</span>:
       <button type="button" className="admin-outline" disabled={!mpSandboxReady||!!checkoutBusy}
         onClick={()=>createMercadoPagoTestCheckout(a.id)}>
        {checkoutBusy===a.id?'Gerando...':'Gerar link TEST'}</button>
     ):<span className="ops-muted">—</span>}</td>
    </tr>)}</tbody>
   </table>
   {!attempts.length?<div className="admin-empty"><ClipboardList size={32}/>
    <h3>Ainda sem preparações</h3>
    <p>O histórico aparecerá após o primeiro teste administrativo.</p>
   </div>:null}</div>
  </section>
  <p className="admin-help"><ShieldCheck size={15}/>
   Sem criação de Pix, checkout externo, cartão, webhook ou pagamento. A integração
   transacional só será liberada após escolher e homologar um provedor, incluindo
   assinatura de webhook, idempotência e conciliação de recebimentos.
  </p>
 </>;
}
