'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {Trash2,Minus,Plus,ArrowLeft,ShieldCheck,ShoppingBag} from 'lucide-react';
import {formatBRL} from '@/lib/products';
import {
 type CartItem,cartIdentity,normalizeCart
} from '@/lib/cart-core';

export default function CartPage(){
 const [cart,setCart]=useState<CartItem[]>([]);
 const [loaded,setLoaded]=useState(false);
 useEffect(()=>{
  try{
   const normalized=normalizeCart(JSON.parse(localStorage.getItem('pope-cart')||'[]'));
   setCart(normalized);
   localStorage.setItem('pope-cart',JSON.stringify(normalized));
  }catch{setCart([]);}
  setLoaded(true);
 },[]);
 function save(next:CartItem[]){
  const clean=normalizeCart(next);
  setCart(clean);
  try{
   localStorage.setItem('pope-cart',JSON.stringify(clean));
   window.dispatchEvent(new Event('pope-cart-updated'));
  }catch{/* Manter carrinho no estado local se armazenamento indisponível. */}
 }
 function update(key:string,delta:number){
  save(cart.map(item=>cartIdentity(item)===key?
   {...item,qty:Math.max(0,Math.min(99,item.qty+delta))}:item)
   .filter(item=>item.qty>0));
 }
 const subtotal=cart.reduce((sum,item)=>sum+item.price_cents*item.qty,0);
 return <div className="container cart-page">
  <div className="section-kicker">SEU MOMENTO POPÊ</div>
  <h1>Meu carrinho 🛍️</h1>
  <p className="demo-alert">Os preços nesta tela são ilustrativos.
   O checkout consulta novamente os preços, a disponibilidade de cada cor/SKU
   e os lotes válidos. A venda online ainda não está habilitada.</p>
  {!loaded?<p>Carregando...</p>:cart.length===0?
   <div className="empty-state"><h2>Seu carrinho está vazio 💖</h2>
    <p>Explore nossa seleção de produtos de beleza.</p>
    <Link className="hero-button" href="/">Ver produtos</Link>
   </div>:
   <div className="cart-layout">
    <div className="cart-items">{cart.map(item=>{
     const key=cartIdentity(item);
     return <div className="cart-item" key={key}>
      <div className="cart-emoji">{item.emoji||'🛍️'}</div>
      <div className="pope-cart-line-info">
       <Link href={'/produto/'+item.slug}><strong>{item.name}</strong></Link>
       {item.variant_id?<small>Variação: {item.variant_name||'SKU selecionado'}
        {item.sku?' · '+item.sku:''}</small>:
        <small>Sem variação selecionada · o checkout verificará se é necessária</small>}
       <p>{formatBRL(item.price_cents)}</p>
       <Link href={'/produto/'+item.slug} className="pope-cart-edit-variant">
        {item.variant_id?'Trocar cor / variação':'Escolher variação'}
       </Link>
      </div>
      <div className="quantity">
       <button type="button" aria-label={'Diminuir quantidade de '+item.name}
        onClick={()=>update(key,-1)}><Minus size={16}/></button>
       <b>{item.qty}</b>
       <button type="button" aria-label={'Aumentar quantidade de '+item.name}
        disabled={item.qty>=99}
        onClick={()=>update(key,1)}><Plus size={16}/></button>
      </div>
      <button type="button" aria-label={'Remover '+item.name+' do carrinho'}
       onClick={()=>save(cart.filter(x=>cartIdentity(x)!==key))}>
       <Trash2 size={19}/>
      </button>
     </div>;
    })}</div>
    <aside className="cart-summary">
     <h2>Resumo</h2>
     <div><span>Itens no carrinho</span>
      <strong>{cart.reduce((sum,item)=>sum+item.qty,0)}</strong></div>
     <div><span>Subtotal ilustrativo</span><strong>{formatBRL(subtotal)}</strong></div>
     <p>Frete e valores oficiais ainda não estão disponíveis.</p>
     <Link href="/checkout" className="add-button pope-cart-review-button">
      <ShieldCheck size={17}/> Conferir preços e estoque
     </Link>
     <button type="button" className="add-button" disabled>
      Pagamento indisponível
     </button>
     <Link href="/"><ArrowLeft size={16}/> Continuar explorando</Link>
    </aside>
   </div>}
  <p className="admin-help"><ShoppingBag size={14}/> Suas escolhas são salvas
   somente neste navegador. Nenhum pedido é criado ao adicionar itens.</p>
 </div>;
}
