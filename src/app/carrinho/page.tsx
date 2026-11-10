'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Trash2, Minus, Plus, ArrowLeft } from 'lucide-react';
import { formatBRL } from '@/lib/catalog';
type CartItem = {id:string;slug:string;name:string;price_cents:number;qty:number;emoji?:string};
export default function CartPage() {
 const [cart,setCart]=useState<CartItem[]>([]),[loaded,setLoaded]=useState(false);
 useEffect(()=>{try{setCart(JSON.parse(localStorage.getItem('pope-cart')||'[]'))}catch{setCart([])}setLoaded(true)},[]);
 function save(items:CartItem[]) { setCart(items);localStorage.setItem('pope-cart',JSON.stringify(items));window.dispatchEvent(new Event('pope-cart-updated')); }
 function update(id:string,delta:number){save(cart.map(item=>item.id===id?{...item,qty:Math.max(0,Math.min(99,item.qty+delta))}:item).filter(item=>item.qty>0))}
 const total=cart.reduce((sum,item)=>sum+item.qty*item.price_cents,0);
 return <div className="container cart-page"><div className="section-kicker">SEU MOMENTO POPÊ</div><h1>Meu carrinho 🛍️</h1>
 <p className="demo-alert">O carrinho é uma prévia local. Checkout, reserva de estoque e pagamento ainda não estão habilitados.</p>
 {!loaded?<p>Carregando...</p>:cart.length===0?<div className="empty-state"><h2>Seu carrinho está vazio 💖</h2><p>Escolha alguns queridinhos para começar.</p><Link className="hero-button" href="/">Ver produtos</Link></div>:
 <div className="cart-layout"><div className="cart-items">{cart.map(item=><div className="cart-item" key={item.id}><div className="cart-emoji">{item.emoji||'🛍️'}</div><div><Link href={'/produto/'+item.slug}><strong>{item.name}</strong></Link><p>{formatBRL(item.price_cents)}</p></div><div className="quantity"><button aria-label="Diminuir quantidade" onClick={()=>update(item.id,-1)}><Minus size={16}/></button><b>{item.qty}</b><button aria-label="Aumentar quantidade" onClick={()=>update(item.id,1)}><Plus size={16}/></button></div><button aria-label="Remover item" onClick={()=>save(cart.filter(x=>x.id!==item.id))}><Trash2 size={20}/></button></div>)}</div>
 <aside className="cart-summary"><h2>Resumo</h2><div><span>Subtotal ilustrativo</span><strong>{formatBRL(total)}</strong></div><p>Frete e valores reais serão calculados no checkout futuro.</p><button disabled className="add-button">Finalizar compra — em breve</button><Link href="/"><ArrowLeft size={16}/> Continuar explorando</Link></aside></div>}
 </div>;
}
