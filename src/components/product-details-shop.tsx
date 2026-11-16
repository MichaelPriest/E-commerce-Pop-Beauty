'use client';
import {useState} from 'react';
import Link from 'next/link';
import {Check,ChevronLeft,ChevronRight,ShoppingBag,ShieldCheck} from 'lucide-react';
import {formatBRL,productImageSrc,type Product} from '@/lib/products';
import {normalizeCart,putCartItem} from '@/lib/cart-core';
import type {CatalogVariant,ProductGalleryPhoto} from '@/lib/catalog';

export function ProductDetailsShop({
 product,demo,variants,gallery
}:{product:Product;demo:boolean;variants:CatalogVariant[];gallery:ProductGalleryPhoto[]}){
 const cover=productImageSrc(product.image_url);
 const images=[
  ...(cover?[{id:'cover',url:cover,alt:'Foto principal de '+product.name}]:[]),
  ...gallery.map(g=>({...g}))
 ];
 const [imageIndex,setImageIndex]=useState(0);
 const [variantId,setVariantId]=useState(variants.length===1?variants[0].variant_id:'');
 const [quantity,setQuantity]=useState(1);
 const [message,setMessage]=useState(''),[error,setError]=useState('');
 const variant=variants.find(v=>v.variant_id===variantId);
 const canAdd=!demo&&!product.is_adult&&!!variant?.available;
 const label=demo?'Produto de demonstração':!variants.length?'Indisponível no momento':
  !variant?'Selecione uma variação':
  variant.available?'Disponível para conferência':'Variação esgotada';
 function add(){
  if(!canAdd||!variant)return;
  setError('');setMessage('');
  try{
   const stored=normalizeCart(JSON.parse(localStorage.getItem('pope-cart')||'[]'));
   const item={
    id:product.id,slug:product.slug,name:product.name,price_cents:product.price_cents,
    qty:quantity,variant_id:variant.variant_id,variant_name:variant.shade||variant.name,
    sku:variant.sku,emoji:product.emoji
   };
   const updated=putCartItem(stored,item);
   if(!updated.some(x=>x.id===item.id&&x.variant_id===item.variant_id)){
    setError('O carrinho atingiu o limite de 30 itens.');return;
   }
   localStorage.setItem('pope-cart',JSON.stringify(updated));
   window.dispatchEvent(new Event('pope-cart-updated'));
   setMessage('Adicionado ao carrinho. Os valores e o estoque serão conferidos no checkout.');
  }catch{
   setError('Não foi possível atualizar o carrinho neste navegador.');
  }
 }
 return <div className="pope-detail-shop">
  <div className="pope-detail-gallery">
   <div className={'detail-visual pope-detail-photo tone-'+(product.tone||'pink')}>
    {images[imageIndex]?<img src={images[imageIndex].url}
     alt={images[imageIndex].alt} loading={imageIndex===0?'eager':'lazy'}/>:
     <span role="img" aria-label="Produto sem fotografia">{product.emoji||'💖'}</span>}
    {images.length>1?<div className="pope-detail-gallery-arrows">
     <button type="button" aria-label="Foto anterior"
      onClick={()=>setImageIndex((imageIndex-1+images.length)%images.length)}>
      <ChevronLeft size={22}/></button>
     <span>{imageIndex+1} / {images.length}</span>
     <button type="button" aria-label="Próxima foto"
      onClick={()=>setImageIndex((imageIndex+1)%images.length)}>
      <ChevronRight size={22}/></button>
    </div>:null}
   </div>
   {images.length>1?<div className="pope-detail-thumbnails"
    aria-label="Fotos do produto">
    {images.map((image,index)=><button key={image.id} type="button"
     aria-label={'Visualizar foto '+(index+1)} aria-pressed={index===imageIndex}
     className={index===imageIndex?'selected':''}
     onClick={()=>setImageIndex(index)}>
     <img src={image.url} alt="" loading="lazy"/>
    </button>)}
   </div>:null}
  </div>
  <div className="detail-content">
   <span className="section-kicker">{product.category} • {product.brand}</span>
   <h1>{product.name}</h1>
   <p>{product.description}</p>
   <div className="stars">✦ Novidade na Popê</div>
   {product.compare_at_cents?<del>{formatBRL(product.compare_at_cents)}</del>:null}
   <strong className="detail-price">{formatBRL(product.price_cents)}</strong>
   <div className="pope-detail-purchase">
    <label htmlFor="pope-variant-select">Cor / Variação</label>
    <select id="pope-variant-select" value={variantId}
     disabled={demo||variants.length===0}
     onChange={event=>{setVariantId(event.target.value);setMessage('');setError('');}}>
     <option value="">Selecione uma opção</option>
     {variants.map(v=><option key={v.variant_id} value={v.variant_id}
      disabled={!v.available}>
      {v.shade||v.name} · {v.sku}{v.available?'':' — Esgotada'}
     </option>)}
    </select>
    <p className={'pope-product-stock'+(canAdd?' is-available':' is-unavailable')}
     role="status">{label}</p>
    <div className="pope-detail-purchase-controls">
     <label>Quantidade
      <select aria-label="Quantidade" value={quantity}
       onChange={event=>setQuantity(Number(event.target.value))}
       disabled={!canAdd}>
       {Array.from({length:10},(_,i)=>i+1).map(n=>
        <option key={n} value={n}>{n}</option>)}
      </select>
     </label>
     <button type="button" className="add-button" disabled={!canAdd}
      onClick={add}><ShoppingBag size={18}/>
      {canAdd?'Adicionar ao carrinho':demo?'Demonstração':!variantId?'Escolha uma opção':'Esgotado'}
     </button>
    </div>
    {message?<p role="status" className="form-success">
     <Check size={15}/> {message} <Link href="/carrinho">Ver carrinho</Link>
    </p>:null}
    {error?<p role="alert" className="form-error">{error}</p>:null}
    <p className="admin-help">A loja ainda não recebe pedidos comerciais.
     O checkout confere a variante, o valor e os lotes no servidor.</p>
   </div>
   <div className="trust-lines">
    <span><ShieldCheck/> Ambiente protegido</span>
    <span><ShoppingBag/> Prévia sem pagamento</span>
   </div>
  </div>
 </div>;
}
