'use client';
import Link from 'next/link';
import { Heart, ShoppingCart } from 'lucide-react';
import { useEffect,useState } from 'react';
import type { Product } from '@/lib/products';
import { formatBRL, productImageSrc } from '@/lib/products';

export function ProductCard({product,demo}:{product:Product;demo:boolean}) {
 const [favorite,setFavorite]=useState(false),[added,setAdded]=useState(false);
 const image=productImageSrc(product.image_url);
 const multiple=product.availability==='variant_selection_required';
 const ready=!demo&&!product.is_adult&&product.availability==='ready';
 const stockLabel=demo?'Produto ilustrativo':multiple?'Escolha de variação necessária':
  product.availability==='ready'?'Disponível para conferência':
  product.availability==='out_of_stock'?'Esgotado':'Indisponível no momento';
 useEffect(()=>{
  try{
   const stored=JSON.parse(localStorage.getItem('pope-favorites')||'[]');
   setFavorite(Array.isArray(stored)&&stored.includes(product.id));
  }catch{setFavorite(false);}
 },[product.id]);
 function toggleFavorite(){
  const next=!favorite;
  setFavorite(next);
  try{
   const stored=JSON.parse(localStorage.getItem('pope-favorites')||'[]');
   const ids=Array.isArray(stored)?stored.filter(x=>typeof x==='string'):[];
   const updated=next?[...new Set([...ids,product.id])]:ids.filter(x=>x!==product.id);
   localStorage.setItem('pope-favorites',JSON.stringify(updated));
  }catch{/* Preferência local opcional; a loja continua utilizável. */}
 }
 const href=(product.is_adult?'/adulto/produto/':'/produto/')+product.slug;
 function add() {
   if(!ready)return;
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
   <button className={'favorite '+(favorite?'is-favorite':'')} onClick={toggleFavorite} aria-label={favorite?'Remover dos favoritos':'Adicionar aos favoritos'}><Heart size={21} fill={favorite?'currentColor':'none'}/></button>
   {product.compare_at_cents && product.compare_at_cents>product.price_cents?<span className="sale-tag">Oferta</span>:null}
   <Link className="product-image" href={href} aria-label={'Ver '+product.name}>
    {image?<img src={image} alt={product.name}/>:<span className="product-emoji" aria-hidden="true">{product.emoji||'💖'}</span>}
   </Link>
  </div><div className="product-details"><span className="product-brand">{product.brand}</span>
  <Link href={'/produto/'+product.slug} className="product-name">{product.name}</Link>
  <div className="stars" aria-label="Avaliações ainda não disponíveis">✦ <span>Novidade</span></div>
  <p className={'pope-product-stock'+(ready?' is-available':' is-unavailable')}
   aria-label={'Situação do produto: '+stockLabel}>{stockLabel}</p>
  {product.compare_at_cents?<del>{formatBRL(product.compare_at_cents)}</del>:<span className="price-placeholder"> </span>}
  <strong className="price">{formatBRL(product.price_cents)}</strong>
  {multiple?<Link className="add-button" href={href}>Ver opções de variação</Link>:
   <button className="add-button" disabled={!ready} onClick={add}>
    <ShoppingCart size={17}/>
    {demo?'Produto de demonstração':ready?(added?'Adicionado!':'Adicionar ao carrinho'):
     product.availability==='out_of_stock'?'Esgotado':'Indisponível'}
   </button>}</div>
  {demo?<span className="demo-card-label">Produto ilustrativo</span>:null}
 </article>
}
