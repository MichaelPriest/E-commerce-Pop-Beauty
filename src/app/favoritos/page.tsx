'use client';
import Link from 'next/link';
import {useEffect,useState,useSyncExternalStore} from 'react';
import {ArrowLeft,ArrowRight,Heart} from 'lucide-react';
import {ProductCard} from '@/components/product-card';
import {favoritesStore} from '@/lib/storefront-lists';
import {CATALOG_PAGE_SIZE} from '@/lib/catalog-query-core';
import type {Product} from '@/lib/products';

type Result={ids:string[];products:Product[];demo:boolean};
export default function FavoritesPage(){
 const ids=useSyncExternalStore<string[]|null>(favoritesStore.subscribe,favoritesStore.getSnapshot,()=>null);
 const [requestedPage,setPage]=useState(1);
 const [result,setResult]=useState<Result|null>(null);
 const [failed,setFailed]=useState<string|null>(null);
 const [retry,setRetry]=useState(0);
 const pages=Math.ceil((ids?.length??0)/CATALOG_PAGE_SIZE);
 const page=Math.min(requestedPage,Math.max(1,pages));
 const batch=ids?.slice().reverse().slice((page-1)*CATALOG_PAGE_SIZE,page*CATALOG_PAGE_SIZE)??[];
 const key=batch.join(',');
 const ready=result!==null&&batch.every(id=>result.ids.includes(id));
 useEffect(()=>{
  if(!key||ready)return;
  const controller=new AbortController();
  async function load(){
   try{
    const response=await fetch('/api/catalogo/favoritos?ids='+encodeURIComponent(key),{signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw new Error();
    const data=await response.json();
    if(!controller.signal.aborted){
     setResult({ids:key.split(','),products:data.products,demo:data.demo});
     setFailed(null);
    }
   }catch{if(!controller.signal.aborted)setFailed(key);}
  }
  void load();
  return ()=>controller.abort();
 },[key,ready,retry]);
 const visible=batch.flatMap(id=>result?.products.find(product=>product.id===id)??[]);
 const missing=batch.length-visible.length;
 return <div className="container customer-area favorites-page">
  <Link className="customer-back" href="/#destaques"><ArrowLeft size={16}/> Voltar à vitrine</Link>
  <h1>Meus favoritos</h1><p>Os produtos que você marcou com o coração ficam salvos neste navegador.</p>
  {ids===null?<p role="status">Carregando favoritos…</p>:ids.length===0?
   <div className="customer-empty"><Heart aria-hidden="true"/><h2>Quais produtos você quer guardar?</h2>
    <p>Toque no coração de um produto para encontrá-lo aqui.</p>
    <Link className="customer-link-button" href="/#destaques">Explorar produtos <ArrowRight size={16}/></Link>
   </div>:<>
    {!ready?(failed===key?<div role="alert"><p>Não foi possível carregar seus favoritos.</p>
     <button className="customer-link-button" onClick={()=>{setFailed(null);setRetry(value=>value+1);}}>Tentar novamente</button></div>:
     <p role="status">Carregando produtos…</p>):<>
     {visible.length>0&&<div className="product-grid">{visible.map(product=><ProductCard key={product.id} product={product} demo={result!.demo}/>)}</div>}
     {missing>0&&<p role="status">{missing===1?'Um item desta página está indisponível':'Alguns itens desta página estão indisponíveis'} na vitrine pública.</p>}
    </>}
    {pages>1&&<nav className="customer-pagination" aria-label="Páginas de favoritos">
     <button disabled={page===1} onClick={()=>setPage(page-1)}>Anterior</button>
     <span>Página {page} de {pages}</span><button disabled={page===pages} onClick={()=>setPage(page+1)}>Próxima</button>
    </nav>}
   </>}
 </div>;
}
