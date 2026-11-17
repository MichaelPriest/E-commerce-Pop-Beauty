'use client';
import Link from 'next/link';
import {Heart,ShoppingCart,Check,Images} from 'lucide-react';
import {useEffect,useState} from 'react';
import type {Product} from '@/lib/products';
import {formatBRL,productImageSrc} from '@/lib/products';
import {normalizeCart,putCartItem} from '@/lib/cart-core';
import {cardVariantLabel,selectedCardVariant} from '@/lib/catalog-card-preview';

export function ProductCard({product,demo}:{product:Product;demo:boolean}){
 const variants=product.preview_variants??[];
 const [selectedId,setSelectedId]=useState(variants.length===1?variants[0].variant_id:'');
 const [favorite,setFavorite]=useState(false);
 const [added,setAdded]=useState(false);
 const [error,setError]=useState('');
 const chosen=selectedCardVariant(variants,selectedId);
 const image=productImageSrc(
  chosen?.image_url??product.image_url??product.preview_general_image_url
 );
 const multiple=variants.length>1||product.availability==='variant_selection_required';
 const ready=!demo&&!product.is_adult&&!!chosen?.available;
 const href=(product.is_adult?'/adulto/produto/':'/produto/')+product.slug+
  (chosen?'?variacao='+encodeURIComponent(chosen.variant_id):'');
 const stockLabel=demo?'Produto de demonstração':
  chosen?(chosen.available?'Disponível para conferência':'Esta cor está esgotada'):
  multiple?'Escolha uma cor ou apresentação':
  product.availability==='out_of_stock'?'Esgotado':'Disponibilidade não confirmada';

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
  }catch{/* Favorito local é opcional. */}
 }
 function chooseVariant(id:string){
  setSelectedId(id);
  setAdded(false);
  setError('');
 }
 function add(){
  if(!ready||!chosen)return;
  setError('');
  try{
   const stored=normalizeCart(JSON.parse(localStorage.getItem('pope-cart')||'[]'));
   const item={
    id:product.id,slug:product.slug,name:product.name,
    price_cents:product.price_cents,qty:1,variant_id:chosen.variant_id,
    variant_name:cardVariantLabel(chosen),sku:chosen.sku,
    emoji:product.emoji,
    ...(image?{image_url:image}:{})
   };
   const updated=putCartItem(stored,item);
   if(!updated.some(x=>x.id===item.id&&x.variant_id===item.variant_id)){
    setError('Carrinho cheio: limite de 30 variações diferentes.');
    return;
   }
   localStorage.setItem('pope-cart',JSON.stringify(updated));
   window.dispatchEvent(new Event('pope-cart-updated'));
   setAdded(true);
  }catch{
   setError('Não foi possível atualizar o carrinho neste navegador.');
  }
 }
 return <article className="product-card pope-swatch-card">
  <div className={'product-visual tone-'+(product.tone||'pink')}>
   <button type="button" className={'favorite '+(favorite?'is-favorite':'')}
    onClick={toggleFavorite}
    aria-label={favorite?'Remover dos favoritos':'Adicionar aos favoritos'}>
    <Heart size={21} fill={favorite?'currentColor':'none'}/>
   </button>
   {product.compare_at_cents&&product.compare_at_cents>product.price_cents?
    <span className="sale-tag">Oferta</span>:null}
   <Link className="product-image" href={href} aria-label={'Ver '+product.name+
    (chosen?' — '+cardVariantLabel(chosen):'')}>
    {image?<img key={image} src={image} alt={product.name+
     (chosen?' — '+cardVariantLabel(chosen):'')} loading="lazy"/>:
     <span className="product-emoji" aria-hidden="true">{product.emoji||'💖'}</span>}
   </Link>
  </div>
  <div className="product-details">
   <span className="product-brand">{product.brand}</span>
   <Link href={href} className="product-name">{product.name}</Link>
   <div className="stars" aria-label="Avaliações ainda não disponíveis">
    ✦ <span>Novidade</span>
   </div>
   {variants.length>1?<div className="pope-card-variants">
    <div className="pope-card-variant-heading">
     <strong>Escolha a cor</strong>
     {chosen?<span aria-live="polite">{cardVariantLabel(chosen)}</span>:null}
    </div>
    <div className="pope-card-swatches" role="group"
     aria-label={'Cores de '+product.name}>
     {variants.slice(0,6).map(variant=>{
      const selected=variant.variant_id===selectedId;
      const variantImage=productImageSrc(variant.image_url);
      return <button key={variant.variant_id} type="button"
       className={'pope-card-swatch'+(selected?' selected':'')+
        (!variant.available?' unavailable':'')}
       aria-pressed={selected}
       aria-label={cardVariantLabel(variant)+
        (variant.available?' — disponível':' — esgotada')}
       title={cardVariantLabel(variant)+' · '+variant.sku+
        (variant.available?'':' (esgotada)')}
       onClick={()=>chooseVariant(variant.variant_id)}>
       {variantImage?<img src={variantImage} alt="" loading="lazy"/>:
        <span aria-hidden="true">{cardVariantLabel(variant).charAt(0).toUpperCase()}</span>}
       {!variant.available?<span className="pope-card-swatch-strike" aria-hidden="true"/>:null}
      </button>;
     })}
     {variants.length>6?<Link className="pope-card-more-variants" href={href}>
      +{variants.length-6} cores</Link>:null}
    </div>
   </div>:variants.length===1?<p className="pope-card-single-sku">
     <Images size={13}/> {cardVariantLabel(variants[0])}
    </p>:null}
   <p className={'pope-product-stock'+(ready?' is-available':' is-unavailable')}
    aria-live="polite">{stockLabel}</p>
   {product.compare_at_cents?
    <del>{formatBRL(product.compare_at_cents)}</del>:
    <span className="price-placeholder"> </span>}
   <strong className="price">{formatBRL(product.price_cents)}</strong>
   {variants.length?<button type="button" className="add-button"
    disabled={!ready} onClick={add}>
    {added?<Check size={17}/>:<ShoppingCart size={17}/>}
    {demo?'Produto ilustrativo':added?'Adicionado!':
     !chosen?'Escolha uma cor':ready?'Adicionar ao carrinho':'Esgotado'}
   </button>:
   <Link className="add-button" href={href}>Ver opções do produto</Link>}
   {error?<p className="form-error" role="alert">{error}</p>:null}
   {chosen?<Link className="pope-card-variant-details" href={href}>
    Ver fotos e informações desta cor</Link>:null}
  </div>
  {demo?<span className="demo-card-label">Produto ilustrativo</span>:null}
 </article>;
}
