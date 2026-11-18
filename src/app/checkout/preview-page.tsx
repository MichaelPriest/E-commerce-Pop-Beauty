'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {
 ArrowLeft,ArrowRight,LockKeyhole,RefreshCw,ShieldCheck,
 Truck,CreditCard,ClipboardList,CheckCircle2,AlertTriangle,ShoppingBag,Clock3,MapPin
} from 'lucide-react';
import {formatBRL} from '@/lib/products';
import {type CartItem,normalizeCart,cartApiItems} from '@/lib/cart-core';
import {cartStore} from '@/lib/storefront-lists';
import {checkoutStatusLabel,type CheckoutPreview} from '@/lib/checkout-preview';
import type {CustomerAddress} from '@/types/customer-address';
import {SandboxShippingQuote} from '@/components/checkout/sandbox-shipping-quote';
import {CheckoutDeliveryPanel} from '@/components/checkout/checkout-delivery-panel';

type CartRow=CartItem;
type Stage='loading'|'empty'|'failed'|'loaded';
type TestOrder={
 order_id:string; expires_at?:string|null; total_cents?:number; status?:string;
 delivery_fee_cents?:number; delivery_name?:string;
 checkout_url?:string;payment_error?:string;
};
export function CheckoutPreviewPage({
 signedIn,isAdmin,addresses,shippingSandboxTokenPresent,shippingOriginConfigured,commercial=false
}:{
 signedIn:boolean;isAdmin:boolean;addresses:CustomerAddress[];
 shippingSandboxTokenPresent:boolean;shippingOriginConfigured:boolean;
 commercial?:boolean;
}){
 const [stage,setStage]=useState<Stage>('loading'),[quote,setQuote]=useState<CheckoutPreview|null>(null);
 const [error,setError]=useState(''),[cartRows,setCartRows]=useState<CartRow[]>([]);
 const [trigger,setTrigger]=useState(0);
 const [addressId,setAddressId]=useState(addresses.find(a=>a.is_default)?.id||addresses[0]?.id||'');
 const [saving,setSaving]=useState(false),[reservationError,setReservationError]=useState('');
 const [testOrder,setTestOrder]=useState<TestOrder|null>(null);
 const idempotencyKey=useRef<string|null>(null);
 async function createTestReservation(){
  if(!isAdmin||!quote?.ready_for_future_checkout||!addressId||saving||testOrder)return;
  setSaving(true);setReservationError('');
  try{
   if(!idempotencyKey.current)idempotencyKey.current=crypto.randomUUID();
   const response=await fetch('/api/checkout/test-reservation',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
     address_id:addressId,request_key:idempotencyKey.current,
     items:cartApiItems(cartRows)
    }),cache:'no-store'
   });
   const body=await response.json();
   if(!response.ok)throw new Error(body.error||'Não foi possível preparar a reserva.');
   setTestOrder(body as TestOrder);
  }catch(e){
   setReservationError(e instanceof Error?e.message:'Falha no teste.');
  }finally{setSaving(false);}
 }
 useEffect(()=>{
  let live=true;
  const load=async()=>{
   if(live){setStage('loading');setError('');}
   let stored:unknown;
   try{stored=JSON.parse(cartStore.readRaw()||'[]');}
   catch{if(live){setError('Não foi possível ler seu carrinho. Volte e revise os itens.');setStage('failed');}return;}
   if(!Array.isArray(stored)||stored.length===0){
    if(live){setStage('empty');setCartRows([]);}
    return;
   }
   if(stored.length>30){if(live){setStage('failed');setError('Limite de 30 itens por conferência.');}return;}
   const rows=normalizeCart(stored);
   if(rows.length!==stored.length){
    if(live){setStage('failed');setError('Há itens inválidos ou duplicados no carrinho. Revise antes de conferir.');}
    return;
   }
   if(live)setCartRows(rows);
   try{
    const response=await fetch('/api/checkout/preview',{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({items:cartApiItems(rows)}),
     cache:'no-store'
    });
    const body=await response.json();
    if(!response.ok)throw new Error(body.error||'Não foi possível validar o carrinho.');
    if(live){setQuote(body as CheckoutPreview);setStage('loaded');}
   }catch(e){
    if(live){setStage('failed');setError(e instanceof Error?e.message:'Falha na conferência.');}
   }
  };
  void load();
  return ()=>{live=false;};
 },[trigger]);
 const allReady=stage==='loaded'&&!!quote?.ready_for_future_checkout;
 return <div className="container pope-checkout-page">
  <div className="section-kicker">{commercial?'POPÊ BEAUTY • FINALIZAR COMPRA':'POPÊ BEAUTY • PRÉVIA DO CHECKOUT'}</div>
  <h1>Confira seu carrinho <span aria-hidden="true">💖</span></h1>
  <p>{commercial?'Confira os produtos, escolha a entrega e continue para o pagamento.':'Os preços e a disponibilidade são conferidos novamente antes da compra.'}</p>
  <div className="pope-checkout-steps" aria-label="Etapas do checkout">
   <span className="complete"><ShoppingBag size={17}/> 1. Carrinho</span>
   <ArrowRight size={15}/>
   <span className="current"><ClipboardList size={17}/> 2. Conferência</span>
   <ArrowRight size={15}/>
   <span className={testOrder?.checkout_url?'current':'disabled'}><LockKeyhole size={17}/> 3. Pagamento{commercial?'':' (desativado)'}</span>
  </div>
  <div className="pope-checkout-body">
   <section className="pope-checkout-items" aria-label="Produtos validados">
    <div className="pope-checkout-head"><h2><ClipboardList size={21}/> Itens conferidos</h2>
     <button type="button" className="admin-outline"
      onClick={()=>setTrigger(x=>x+1)} disabled={stage==='loading'||saving||!!testOrder}>
      <RefreshCw size={16}/> Conferir novamente</button></div>
    {stage==='loading'?<p className="pope-checkout-info">Consultando preços, variantes e lotes disponíveis...</p>:null}
    {stage==='failed'?<div className="pope-checkout-warning" role="alert">
     <AlertTriangle size={20}/><p>{error}</p>
    </div>:null}
    {stage==='empty'?<div className="empty-state">
     <h2>Seu carrinho está vazio</h2><p>Escolha seus produtos antes de conferir.</p>
     <Link href="/" className="hero-button">Ver catálogo</Link>
    </div>:null}
    {stage==='loaded'&&quote?<>
     {quote.lines.map((item,i)=><div className="pope-checkout-item" key={item.product_id+'-'+(item.variant_id??i)}>
      <div className="pope-checkout-item-icon"><ShoppingBag size={23}/></div>
      <div className="pope-checkout-item-content">
       <strong>{item.name}</strong>
       {item.variant_name?<small>Cor/variação: {item.variant_name}</small>:null}
       <small>Quantidade: {item.quantity}</small>
       <span className={'pope-checkout-state '+(item.status==='ready'?'ok':'blocked')}>
        {item.status==='ready'?<CheckCircle2 size={14}/>:<AlertTriangle size={14}/>}
        {checkoutStatusLabel[item.status]}</span>
       {item.status==='variant_selection_required'?<small>Este produto possui várias variações. Abra a página do produto e escolha a cor ou apresentação antes de continuar.</small>:null}
      </div>
      <div className="pope-checkout-price">
       <strong>{item.line_total_cents!==null?formatBRL(item.line_total_cents):'—'}</strong>
       {item.unit_price_cents!==null?<small>{formatBRL(item.unit_price_cents)} cada</small>:null}
      </div>
     </div>)}
     {!allReady?<p className="pope-checkout-warning"><AlertTriangle size={18}/>
      Um ou mais itens exigem ajustes. Volte ao carrinho ou escolha outros produtos para continuar.</p>:null}
    </>:null}
    {stage==='loaded'&&quote&&allReady?<section className="pope-checkout-test">
     <div className="pope-checkout-test-heading"><Clock3 size={20}/>
      <div><h3>{commercial?'Dados de entrega':'Preparação para pedidos'}</h3>
       <p>{commercial?'Escolha um endereço da sua conta.':'Cadastro de entrega e reserva temporária em homologação.'}</p></div></div>
     {!signedIn?<p>Entre na sua conta para escolher o endereço de entrega.
      <Link href="/entrar" className="pope-checkout-link"> Entrar na Popê Beauty</Link></p>:
      <>
       <div className="pope-checkout-delivery-header">
        <strong><MapPin size={17}/> Endereço de entrega</strong>
        <Link href="/conta/enderecos">Gerenciar endereços</Link>
       </div>
       {addresses.length?<select value={addressId} onChange={e=>setAddressId(e.target.value)}
        aria-label="Selecionar endereço de entrega" disabled={!!testOrder||saving}>
        {addresses.map(a=><option key={a.id} value={a.id}>
         {a.recipient} · {a.street}, {a.house_number} · {a.city}/{a.state_code}
        </option>)}
       </select>:<p>Você ainda não possui endereço cadastrado.
        <Link href="/conta/enderecos" className="pope-checkout-link"> Cadastrar endereço</Link></p>}
       {isAdmin&&!commercial&&addresses.length>0?<SandboxShippingQuote
        postalCode={addresses.find(a=>a.id===addressId)?.postal_code||''}
        items={cartApiItems(cartRows)}
        sandboxTokenPresent={shippingSandboxTokenPresent}
        originConfigured={shippingOriginConfigured}
       />:null}
       {!commercial&&(isAdmin?<div className="pope-checkout-admin-test">
        <p><ShieldCheck size={17}/> A reserva de teste dura 15 minutos. Você pode encerrá-la na sua conta.</p>
        {reservationError?<p className="form-error" role="alert">{reservationError}</p>:null}
        {testOrder?<div className="pope-checkout-test-success" role="status">
         <CheckCircle2 size={22}/><div><strong>
          {testOrder.status==='cancelled'?'Reserva de teste encerrada':'Reserva de homologação criada'}
         </strong>
          <small>#{testOrder.order_id.slice(0,8).toUpperCase()}
           {testOrder.expires_at&&testOrder.status!=='cancelled'?' · até '+new Date(testOrder.expires_at).toLocaleTimeString('pt-BR',{
            hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'
           }):''}
          </small>
          {testOrder.delivery_name&&<small>{testOrder.delivery_name} · {formatBRL(testOrder.total_cents??0)}</small>}
          <Link href="/conta">Acompanhar ou cancelar na minha conta</Link>
         </div></div>:
         <details>
          <summary>Simular somente a reserva de estoque</summary>
          <button type="button" className="admin-outline" onClick={createTestReservation}
           disabled={!addressId||saving}>{saving?'Reservando…':'Simular reserva por 15 minutos'}</button>
         </details>}
       </div>:<p className="pope-checkout-test-notice">
        A etapa de reserva ainda está disponível apenas para administradores durante a homologação.
        A escolha de entrega poderá ser concluída quando a loja abrir o checkout.</p>)}
      </>}
    </section>:null}
   </section>
   <aside className="pope-checkout-summary">
    <h2>Resumo da conferência</h2>
    <div><span>Subtotal no servidor</span><strong>{quote&&stage==='loaded'?formatBRL(quote.subtotal_cents):'—'}</strong></div>
    {(commercial||isAdmin)&&signedIn&&addressId&&allReady&&quote&&!testOrder?
     <CheckoutDeliveryPanel key={addressId} addressId={addressId} quote={quote}
      saving={saving} setSaving={setSaving} onCreated={setTestOrder} commercial={commercial}
      recipient={addresses.find(a=>a.id===addressId)?.recipient}/>:
     testOrder?.delivery_name?<>
      <div><span>{commercial?'Frete':'Frete de teste'}</span><strong>{formatBRL(testOrder.delivery_fee_cents??0)}</strong></div>
      <div><span>Total com entrega</span><strong>{formatBRL(testOrder.total_cents??0)}</strong></div>
     </>:<div><span>Frete</span><strong>{testOrder?'—':'A calcular'}</strong></div>}
    {commercial&&testOrder?<>
     <p role="status">Pedido #{testOrder.order_id.slice(0,8).toUpperCase()} registrado.</p>
     {testOrder.payment_error?<p className="form-error">{testOrder.payment_error}</p>:null}
     {testOrder.checkout_url?<a href={testOrder.checkout_url} className="admin-primary">Pagar no Mercado Pago</a>:null}
     <Link className="pope-checkout-back" href="/conta">Acompanhar em Minha conta</Link>
    </>:null}
    {!commercial&&<>
    <div><span>Pagamento</span><strong>Indisponível</strong></div>
    <p className="pope-checkout-caution"><LockKeyhole size={18}/>
     Para clientes, esta página é apenas uma conferência, sem reserva de estoque ou cobrança.
     Administradores podem criar reservas temporárias de homologação. O preço final depende do frete e do gateway escolhido.</p>
    <button type="button" className="add-button" disabled>
     <LockKeyhole size={17}/> Pagamento ainda não liberado
    </button></>}
    <Link href="/carrinho" className="pope-checkout-back"><ArrowLeft size={16}/> Voltar ao carrinho</Link>
    <Link href="/" className="pope-checkout-back"><ShoppingBag size={16}/> Continuar explorando</Link>
    <div className="pope-checkout-trust"><span><ShieldCheck size={17}/> Preços conferidos no servidor</span>
     <span><Truck size={17}/> {commercial?'Entrega calculada por CEP':'Frete em conferência'}</span>
     <span><CreditCard size={17}/> Sem coleta de dados de cartão</span></div>
   </aside>
  </div>
 </div>;
}
