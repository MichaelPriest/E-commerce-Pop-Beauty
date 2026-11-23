'use client';
import {useEffect,useRef} from 'react';
import Link from 'next/link';
import {ArrowUpRight,Clapperboard,Volume2} from 'lucide-react';
import type {FeedPostView} from '@/lib/feed-core';
import {formatBRL,productImageSrc} from '@/lib/products';

/** Videos autoplay muted only while visible; native controls enable sound by user choice. */
export function FeedReels({posts}:{posts:FeedPostView[]}){
 const container=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const root=container.current;
  if(!root||!('IntersectionObserver' in window))return;
  const observer=new IntersectionObserver(entries=>{
   for(const entry of entries){
    const video=entry.target as HTMLVideoElement;
    if(entry.isIntersecting&&entry.intersectionRatio>=0.7){
     video.muted=true;
     void video.play().catch(()=>{});
    }else video.pause();
   }
  },{root,threshold:[0,.7,1]});
  root.querySelectorAll('video').forEach(video=>observer.observe(video));
  return ()=>observer.disconnect();
 },[posts]);
 return <div ref={container} className="pope-reels-scroll" aria-label="Vídeos da equipe Popê">
  {posts.map(post=><article className="pope-reel" key={post.id}>
   {post.media_url?<video src={post.media_url} playsInline muted loop controls
    preload="metadata" aria-label={(post.body.startsWith('[DEMO POPÊ]')?'Vídeo ilustrativo: ':'Vídeo da Popê: ')+(post.body.slice(0,100)||'Tutorial de beleza')}
    poster={post.product?.image_url?productImageSrc(post.product.image_url)??undefined:undefined}/>:
    <div className="pope-reel-missing">Vídeo indisponível. Atualize a página.</div>}
   <div className="pope-reel-overlay">
    <span className="pope-reel-official"><Clapperboard size={17}/>
     {post.body.startsWith('[DEMO POPÊ]')?'AMOSTRA DE TESTE · NÃO É PROPAGANDA':'POPÊ BEAUTY'}</span>
    <p>{post.body||'Novidades e dicas da equipe Popê.'}</p>
    {post.product?<Link href={'/produto/'+post.product.slug} className="pope-reel-shop">
     <span><small>{post.body.startsWith('[DEMO POPÊ]')?'Produto ilustrativo':'Produto do vídeo'}</small><strong>{post.product.name}</strong>
      <small>{formatBRL(post.product.price_cents)}</small></span>
     <ArrowUpRight size={23}/></Link>:null}
    {!post.product&&post.category?<Link className="pope-reel-category"
     href={'/?categoria='+encodeURIComponent(post.category.slug)+'#destaques'}>
      Ver {post.category.name} <ArrowUpRight size={15}/>
     </Link>:null}
    <small className="pope-reel-tip"><Volume2 size={14}/> Use o controle do vídeo para ativar o som</small>
   </div>
  </article>)}
 </div>;
}
