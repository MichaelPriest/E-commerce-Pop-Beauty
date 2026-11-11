'use client';
import {useMemo,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {ShieldCheck,ClipboardList,Clock3,AlertTriangle,RefreshCcw,FileCheck} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {PAYMENT_GATEWAYS} from '@/lib/payment-gateways';
import {formatBRL} from '@/lib/products';
import {dateTimeBR} from '@/types/operations';
import type {SandboxPaymentAttempt,SandboxReservation} from './types';

const allowed=PAYMENT_GATEWAYS.filter(g=>g.sandbox==='available');

export function SandboxPaymentPlanner({reservations,attempts}:{
 reservations:SandboxReservation[];attempts:SandboxPaymentAttempt[];
}){
 const router=useRouter();
 const [orderId,setOrderId]=useState(''),[provider,setProvider]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
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
  </section>
  <section className="pope-sandbox-pay-panel">
   <div className="pope-sandbox-pay-header">
    <div><h2><RefreshCcw size={20}/> Histórico de preparações</h2>
     <p>Preparações expiradas ou canceladas não representam transações financeiras.</p></div>
   </div>
   <div className="ops-table-scroll"><table className="ops-table">
    <thead><tr><th>Registrado</th><th>Reserva</th><th>Gateway</th><th>Valor dos itens</th><th>Ambiente</th><th>Estado</th></tr></thead>
    <tbody>{attempts.map(a=><tr key={a.id}>
     <td>{dateTimeBR(a.created_at)}</td>
     <td>#{a.order_id.slice(0,8).toUpperCase()}</td>
     <td>{PAYMENT_GATEWAYS.find(g=>g.id===a.provider)?.name??a.provider}</td>
     <td>{formatBRL(a.amount_cents)}</td><td><span className="ops-tag">Sandbox</span></td>
     <td>{a.state==='draft'?'Preparação (sem cobrança)':a.state==='expired'?'Expirada':'Cancelada'}</td>
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
