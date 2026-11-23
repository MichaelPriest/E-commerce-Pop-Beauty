'use client';
import Link from 'next/link';
import {useEffect,useSyncExternalStore} from 'react';
import {Trash2,Minus,Plus,ArrowLeft,ShieldCheck,ShoppingBag} from 'lucide-react';
import {formatBRL} from '@/lib/products';
import {
 type CartItem,cartIdentity,cartQuantity
} from '@/lib/cart-core';
import {cartStore} from '@/lib/storefront-lists';
import {SavedCartPanel} from '@/components/saved-cart-panel';

export default function CartPage(){
 const items=useSyncExternalStore<CartItem[]|null>(cartStore.subscribe,cartStore.getSnapshot,()=>null);
 const cart=items??[];
 useEffect(()=>{
  const raw=cartStore.readRaw(), normalized=cartStore.getSnapshot();
  if(raw!==null&&raw!==JSON.stringify(normalized))cartStore.write(normalized);
 },[]);
 function update(key:string,delta:number){
  const next=cartStore.getSnapshot().map(item=>cartIdentity(item)===key?
   {...item,qty:Math.max(0,Math.min(99,item.qty+delta))}:item);
  cartStore.write(next.filter(item=>item.qty>0));
 }
 const subtotal=cart.reduce((sum,item)=>sum+item.price_cents*item.qty,0);
 return <div className="container cart-page">
  <div className="section-kicker">SEU MOMENTO POPÊ</div>
  <h1>Meu carrinho 🛍️</h1>
  <p className="demo-alert">Confira os produtos e as quantidades. Na próxima etapa a loja verifica o preço e o estoque de cada variação.</p>
  {items===null?<p role="status">Carregando carrinho…</p>:cart.length===0?
   <div className="empty-state"><h2>Seu carrinho está vazio 💖</h2>
    <p>Explore nossa seleção de produtos de beleza.</p>
    <Link className="hero-button" href="/">Ver produtos</Link>
   </div>:
   <div className="cart-layout">
    <div className="cart-items">{cart.map(item=>{
     const key=cartIdentity(item);
     const detailHref='/produto/'+item.slug+
      (item.variant_id?'?variacao='+encodeURIComponent(item.variant_id):'');
     return <div className="cart-item pope-cart-product" key={key}>
      <Link className="cart-emoji pope-cart-thumbnail" href={detailHref}
       aria-label={'Ver imagens de '+item.name+
        (item.variant_name?' na cor '+item.variant_name:'')}>
       {item.image_url?<img src={item.image_url} width={88} height={88}
        alt={'Foto de '+item.name+(item.variant_name?' — '+item.variant_name:'')}
        loading="lazy" decoding="async"/>:
        <span aria-hidden="true">{item.emoji||'🛍️'}</span>}
      </Link>
      <div className="pope-cart-line-info">
       <Link href={detailHref}><strong>{item.name}</strong></Link>
       {item.variant_id?<small>Variação: {item.variant_name||'SKU selecionado'}
        {item.sku?' · '+item.sku:''}</small>:
        <small>Sem variação selecionada · o checkout verificará se é necessária</small>}
       <p>{formatBRL(item.price_cents)}</p>
       <Link href={detailHref} className="pope-cart-edit-variant">
        {item.variant_id?'Ver fotos ou escolher outra cor':'Escolher cor ou variação'}
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
       onClick={()=>cartStore.write(cartStore.getSnapshot().filter(x=>cartIdentity(x)!==key))}>
       <Trash2 size={19}/>
      </button>
     </div>;
    })}</div>
    <aside className="cart-summary">
     <h2>Resumo</h2>
     <div><span>Itens no carrinho</span>
      <strong>{cartQuantity(cart)}</strong></div>
     <div><span>Subtotal dos produtos</span><strong>{formatBRL(subtotal)}</strong></div>
     <p>O subtotal considera apenas os produtos.</p>
     <Link href="/checkout" className="add-button pope-cart-review-button">
      <ShieldCheck size={17}/> Conferir preços e estoque
     </Link>
     <Link href="/"><ArrowLeft size={16}/> Continuar explorando</Link>
    </aside>
   </div>}
  <SavedCartPanel/>
  <p className="admin-help"><ShoppingBag size={14}/> Sem login, suas escolhas permanecem neste navegador.
   Quando você entra na conta, elas também podem ser salvas para recuperação.
   Adicionar itens não cria pedidos nem reserva estoque.</p>
 </div>;
}
