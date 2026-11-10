'use client';
import Link from 'next/link';
import { Heart, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import type { Product } from '@/lib/products';
import { formatBRL } from '@/lib/products';

export function ProductCard({product,demo}:{product:Product;demo:boolean}) {
 const [favorite,setFavorite]=useState(false),[added,setAdded]=useState(false);
 function add() {
   try {
     const current = JSON.parse(localStorage.getItem('pope-cart') || '[]') as {id:string;slug:string;name:string;price_cents:number;qty:number;emoji?:string}[];
     const found=current.find(item=>item.id===product.id);
     if(found) found.qty=Math.min(found.qty+1,99);
     else current.push({id:product.id,slug:product.slug,name:product.name,price_cents:product.price_cents,qty:1,emoji:product.emoji});
     localStorage.setItem('pope-cart',JSON.stringify(current)); window.dispatchEvent(new Event('pope-cart-updated'));
     setAdded(true); setTimeout(()=>setAdded(false),1800);
   } catch { alert('Não foi possível atualizar o carrinho neste navegador.'); }
 }
 return <article className="product-card">
  <div className={'product-visual tone-'+(product.tone||'pink')}>
   <button className={'favorite '+(favorite?'is-favorite':'')} onClick={()=>setFavorite(!favorite)} aria-label={favorite?'Remover dos favoritos':'Adicionar aos favoritos'}><Heart size={21} fill={favorite?'currentColor':'none'}/></button>
   {product.compare_at_cents && product.compare_at_cents>product.price_cents?<span className="sale-tag">Oferta</span>:null}
   <Link className="product-image" href={'/produto/'+product.slug} aria-label={'Ver '+product.name}>
    {product.image_url?<img src={product.image_url} alt={product.name}/>:<span className="product-emoji" aria-hidden="true">{product.emoji||'💖'}</span>}
   </Link>
  </div><div className="product-details"><span className="product-brand">{product.brand}</span>
  <Link href={'/produto/'+product.slug} className="product-name">{product.name}</Link>
  <div className="stars" aria-label="Avaliações ainda não disponíveis">✦ <span>Novidade</span></div>
  {product.compare_at_cents?<del>{formatBRL(product.compare_at_cents)}</del>:<span className="price-placeholder"> </span>}
  <strong className="price">{formatBRL(product.price_cents)}</strong>
  <button className="add-button" onClick={add}><ShoppingCart size={17}/>{added?'Adicionado!':'Adicionar ao carrinho'}</button></div>
  {demo?<span className="demo-card-label">Produto ilustrativo</span>:null}
 </article>
}
