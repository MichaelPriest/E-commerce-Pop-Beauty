'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {
 ArrowLeft,ArrowRight,LockKeyhole,RefreshCw,ShieldCheck,
 Truck,CreditCard,ClipboardList,CheckCircle2,AlertTriangle,ShoppingBag
} from 'lucide-react';
import {formatBRL} from '@/lib/products';
import {checkoutStatusLabel,type CheckoutPreview} from '@/lib/checkout-preview';

type CartRow={id:string;slug:string;name:string;price_cents:number;qty:number;emoji?:string};
type Stage='loading'|'empty'|'failed'|'loaded';
export function CheckoutPreviewPage(){
 const [stage,setStage]=useState<Stage>('loading'),[quote,setQuote]=useState<CheckoutPreview|null>(null);
 const [error,setError]=useState(''),[cartRows,setCartRows]=useState<CartRow[]>([]);
 const [trigger,setTrigger]=useState(0);
 useEffect(()=>{
  let live=true;
  const load=async()=>{
   if(live){setStage('loading');setError('');}
   let stored:unknown;
   try{stored=JSON.parse(localStorage.getItem('pope-cart')||'[]');}
   catch{if(live){setError('Não foi possível ler seu carrinho. Volte e revise os itens.');setStage('failed');}return;}
   if(!Array.isArray(stored)||stored.length===0){
    if(live){setStage('empty');setCartRows([]);}
    return;
   }
   if(stored.length>30){if(live){setStage('failed');setError('Limite de 30 produtos por conferência.');}return;}
   const rows:CartRow[]=[];
   for(const item of stored){
    if(!item||typeof item!=='object'){
     if(live){setStage('failed');setError('Existe um item inválido no carrinho.');}return;
    }
    const row=item as Partial<CartRow>;
    if(typeof row.id!=='string'||row.id.length>80||
     !Number.isInteger(row.qty)||Number(row.qty)<1||Number(row.qty)>99){
     if(live){setStage('failed');setError('Verifique as quantidades e os produtos no carrinho.');}
     return;
    }
    rows.push({id:row.id,slug:typeof row.slug==='string'?row.slug:'',
      name:typeof row.name==='string'?row.name:'Produto',
      price_cents:Number(row.price_cents)||0,qty:row.qty as number});
   }
   if(live)setCartRows(rows);
   try{
    const response=await fetch('/api/checkout/preview',{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({items:rows.map(r=>({product_id:r.id,quantity:r.qty}))}),
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
  <div className="section-kicker">POPÊ BEAUTY • PRÉVIA DO CHECKOUT</div>
  <h1>Confira seu carrinho <span aria-hidden="true">💖</span></h1>
  <p>Os preços e a disponibilidade são conferidos novamente no banco de dados. Não é possível pagar nesta etapa.</p>
  <div className="pope-checkout-steps" aria-label="Etapas do checkout">
   <span className="complete"><ShoppingBag size={17}/> 1. Carrinho</span>
   <ArrowRight size={15}/>
   <span className="current"><ClipboardList size={17}/> 2. Conferência</span>
   <ArrowRight size={15}/>
   <span className="disabled"><LockKeyhole size={17}/> 3. Pagamento (desativado)</span>
  </div>
  <div className="pope-checkout-body">
   <section className="pope-checkout-items" aria-label="Produtos validados">
    <div className="pope-checkout-head"><h2><ClipboardList size={21}/> Itens conferidos</h2>
     <button type="button" className="admin-outline"
      onClick={()=>setTrigger(x=>x+1)} disabled={stage==='loading'}>
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
     {quote.lines.map((item,i)=><div className="pope-checkout-item" key={item.product_id+'-'+i}>
      <div className="pope-checkout-item-icon"><ShoppingBag size={23}/></div>
      <div className="pope-checkout-item-content">
       <strong>{item.name}</strong><small>Quantidade: {item.quantity}</small>
       <span className={'pope-checkout-state '+(item.status==='ready'?'ok':'blocked')}>
        {item.status==='ready'?<CheckCircle2 size={14}/>:<AlertTriangle size={14}/>}
        {checkoutStatusLabel[item.status]}</span>
       {item.status==='variant_selection_required'?<small>Este produto possui mais de uma variação. A escolha de cor/tamanho será necessária antes da venda.</small>:null}
      </div>
      <div className="pope-checkout-price">
       <strong>{item.line_total_cents!==null?formatBRL(item.line_total_cents):'—'}</strong>
       {item.unit_price_cents!==null?<small>{formatBRL(item.unit_price_cents)} cada</small>:null}
      </div>
     </div>)}
     {!allReady?<p className="pope-checkout-warning"><AlertTriangle size={18}/>
      Um ou mais itens exigem ajustes. Volte ao carrinho ou escolha outros produtos para continuar.</p>:null}
    </>:null}
   </section>
   <aside className="pope-checkout-summary">
    <h2>Resumo da conferência</h2>
    <div><span>Subtotal no servidor</span><strong>{quote&&stage==='loaded'?formatBRL(quote.subtotal_cents):'—'}</strong></div>
    <div><span>Frete</span><strong>A calcular</strong></div>
    <div><span>Pagamento</span><strong>Indisponível</strong></div>
    <p className="pope-checkout-caution"><LockKeyhole size={18}/>
     Esta página não reserva estoque, não cria pedidos e não gera cobranças.
     O valor final dependerá do frete, das condições comerciais e de uma nova validação no checkout definitivo.</p>
    <button type="button" className="add-button" disabled>
     <LockKeyhole size={17}/> Pagamento ainda não liberado
    </button>
    <Link href="/carrinho" className="pope-checkout-back"><ArrowLeft size={16}/> Voltar ao carrinho</Link>
    <Link href="/" className="pope-checkout-back"><ShoppingBag size={16}/> Continuar explorando</Link>
    <div className="pope-checkout-trust"><span><ShieldCheck size={17}/> Preços conferidos no servidor</span>
     <span><Truck size={17}/> Frete não contratado</span>
     <span><CreditCard size={17}/> Sem coleta de dados de cartão</span></div>
   </aside>
  </div>
 </div>;
}
