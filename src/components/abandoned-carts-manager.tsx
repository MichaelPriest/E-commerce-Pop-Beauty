'use client';
import {useMemo,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Clock3,ShoppingCart,Search,ShieldCheck,AlertCircle,CheckCircle2} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {formatBRL} from '@/lib/products';
import {cartCurrentSubtotal,type SavedCartRow} from '@/lib/cart-recovery-core';
import {dateTimeBR} from '@/types/operations';

type CartItemProduct={id:string;name:string;slug:string;price_cents:number};
export type AbandonedCartRow=SavedCartRow&{customer_name:string;
 status:'active'|'abandoned'|'ordered'|'closed';
 products:CartItemProduct[]};
export function AbandonedCartsManager({rows}:{rows:AbandonedCartRow[]}){
 const router=useRouter();
 const [filter,setFilter]=useState('abandoned'),[query,setQuery]=useState('');
 const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState('');
 const totals=useMemo(()=>{
  const abandoned=rows.filter(r=>r.status==='abandoned');
  return {abandoned:abandoned.length,
   optIn:abandoned.filter(r=>r.reminders_opt_in).length,
   reviewing:abandoned.filter(r=>r.review_state==='reviewing').length,
   units:abandoned.reduce((s,r)=>s+r.item_count,0),
   estimate:abandoned.reduce((sum,r)=>sum+cartCurrentSubtotal(
    r.items,new Map(r.products.map(p=>[p.id,p.price_cents]))),0)};
 },[rows]);
 const visible=rows.filter(r=>
  (filter==='all'||(filter==='optin'?r.status==='abandoned'&&r.reminders_opt_in:
   filter==='reviewing'?r.status==='abandoned'&&r.review_state==='reviewing':
   r.status===filter)) &&
  [r.customer_name,r.user_id,...r.products.map(p=>p.name)].join(' ')
   .toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))
 );
 async function setState(userId:string,state:'new'|'reviewing'|'closed'){
  if(busy)return;setBusy(userId);setError('');
  const {data,error:dbError}=await createClient().from('customer_saved_carts')
   .update({review_state:state}).eq('user_id',userId)
   .select('user_id').maybeSingle();
  if(dbError||!data)setError('Falha ao atualizar o acompanhamento. Verifique sua sessão.');
  else router.refresh();
  setBusy(null);
 }
 return <section className="pope-cart-abandonment">
  <div className="pope-cart-recovery-stats">
   <div><ShoppingCart/><small>Carrinhos inativos há 60 minutos ou mais</small>
    <strong>{totals.abandoned}</strong></div>
   <div><ShieldCheck/><small>Autorizaram lembretes</small><strong>{totals.optIn}</strong></div>
   <div><Clock3/><small>Em acompanhamento manual</small><strong>{totals.reviewing}</strong></div>
   <div><ShoppingCart/><small>Valor ilustrativo dos produtos</small>
    <strong>{formatBRL(totals.estimate)}</strong></div>
  </div>
  <div className="pope-cart-recovery-filter">
   <label><Search size={16}/> Buscar nome ou produto
    <input value={query} onChange={e=>setQuery(e.target.value)}
     placeholder="Cliente ou item" type="search"/></label>
   <label>Visualizar
    <select value={filter} onChange={e=>setFilter(e.target.value)}>
     <option value="abandoned">Abandonados</option>
     <option value="optin">Com autorização de lembrete</option>
     <option value="reviewing">Em acompanhamento</option>
     <option value="active">Recentes / ativos</option>
     <option value="ordered">Com pedido posterior</option>
     <option value="closed">Encerrados</option>
     <option value="all">Todos</option>
    </select></label>
  </div>
  {error?<p className="form-error" role="alert">{error}</p>:null}
  {visible.length?<div className="pope-cart-recovery-list">
   {visible.map(row=>{
    const prices=new Map(row.products.map(p=>[p.id,p.price_cents]));
    const estimate=cartCurrentSubtotal(row.items,prices);
    return <article key={row.user_id} className="pope-cart-recovery-item">
     <div className="pope-cart-recovery-item-head">
      <div><strong>{row.customer_name||'Cliente sem nome configurado'}</strong>
       <small>Conta #{row.user_id.slice(0,8).toUpperCase()}</small>
      </div>
      <span className={'pope-cart-recovery-status status-'+row.status}>
       {row.status==='abandoned'?'Inativo':row.status==='active'?'Ativo':
        row.status==='ordered'?'Pedido iniciado':'Encerrado'}
      </span>
     </div>
     <div className="pope-cart-recovery-facts">
      <span>Última alteração: <strong>{dateTimeBR(row.last_activity_at)}</strong></span>
      <span>Unidades: <strong>{row.item_count}</strong></span>
      <span>Subtotal estimado: <strong>{formatBRL(estimate)}</strong></span>
     </div>
     <ul className="pope-cart-recovery-products">
      {row.items.map((line,i)=>{
       const p=row.products.find(product=>product.id===line.product_id);
       return <li key={line.product_id+'-'+line.variant_id+'-'+i}>
        <span>{line.quantity}× {p?.name??'Produto indisponível'}</span>
        {p?<Link href={'/produto/'+p.slug}>Ver produto</Link>:null}
       </li>;
      })}
     </ul>
     <p className="pope-cart-recovery-permission">
      {row.reminders_opt_in?
       <><ShieldCheck size={16}/> Cliente autorizou lembretes (nenhum envio automático está ativo).</>:
       <><AlertCircle size={16}/> Sem autorização para lembretes de recuperação.</>}
     </p>
     <div className="pope-cart-recovery-actions">
      {row.review_state!=='reviewing'?
       <button type="button" className="admin-outline" disabled={!!busy}
        onClick={()=>setState(row.user_id,'reviewing')}>
        <Clock3 size={16}/> Marcar em acompanhamento</button>:null}
      {row.review_state!=='closed'?
       <button type="button" className="admin-outline" disabled={!!busy}
        onClick={()=>setState(row.user_id,'closed')}>
        <CheckCircle2 size={16}/> Encerrar acompanhamento</button>:null}
      {row.review_state!=='new'?
       <button type="button" className="admin-outline" disabled={!!busy}
        onClick={()=>setState(row.user_id,'new')}>Reabrir</button>:null}
     </div>
    </article>;
   })}
  </div>:<div className="pope-feed-empty">
   <ShoppingCart size={36}/><h2>Sem carrinhos neste filtro</h2>
   <p>A central acompanha apenas carrinhos de clientes autenticados,
    salvos na conta e sem pedido posterior correspondente.</p>
  </div>}
  <p className="pope-cart-recovery-help">
   O subtotal é calculado usando os preços atuais dos produtos cadastrados,
   não é uma proposta comercial nem inclui frete, desconto ou tributos.
   Acompanhamento não envia e-mail, não altera pedidos e não reserva estoque.
   Sem autorização não devem ser enviados lembretes de marketing.
  </p>
 </section>;
}
