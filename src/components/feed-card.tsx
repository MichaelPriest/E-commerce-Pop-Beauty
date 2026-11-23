import Link from 'next/link';
import {ImageIcon,Play,CalendarDays,ShoppingBag,Tags,ShieldCheck} from 'lucide-react';
import {FeedLike} from './feed-like';
import {formatBRL,productImageSrc} from '@/lib/products';
import type {FeedPostView} from '@/lib/feed-core';

export function FeedCard({post,userId,liked=false,moderation=false}:{
 post:FeedPostView;userId:string|null;liked?:boolean;moderation?:boolean;
}){
 const date=post.published_at??post.created_at;
 const price=post.product?.price_cents??0;
 const productImg=post.product?.image_url?productImageSrc(post.product.image_url):null;
 return <article className="pope-feed-card">
  <header className="pope-feed-card-head">
   <span className="pope-feed-avatar" aria-hidden="true">
    {post.author_name.trim().charAt(0).toUpperCase()||'P'}
   </span>
   <div><strong>{post.author_name}</strong>
    <span><CalendarDays size={13}/><time dateTime={date}>
     {new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',
      month:'short',year:'numeric'}).format(new Date(date))}
    </time></span></div>
   {moderation?<span className={'pope-feed-status is-'+post.status}>
    {post.status==='pending'?'Em análise':post.status==='published'?'Publicado':
     post.status==='rejected'?'Não aprovado':'Oculto'}</span>:null}
  </header>
  {post.body?<p className="pope-feed-card-text">{post.body}</p>:null}
  {post.media_path?(post.media_url?
   post.media_kind==='image'?
    <div className="pope-feed-card-media">
     <img src={post.media_url} alt={'Imagem da postagem de '+post.author_name}
      loading="lazy"/>
    </div>:
    <div className="pope-feed-card-media is-video">
     <video src={post.media_url} controls preload="metadata" playsInline
      aria-label={'Vídeo publicado por '+post.author_name}/>
     <span className="pope-feed-video-badge"><Play size={14}/> Vídeo</span>
    </div>:
    <p className="pope-feed-media-unavailable"><ImageIcon size={17}/>
     Mídia indisponível no momento.</p>):null}
  {post.product?<Link className="pope-feed-product" href={'/produto/'+post.product.slug}>
    {productImg?<img src={productImg} alt="" loading="lazy"/>:
     <span className="pope-feed-product-placeholder"><ShoppingBag size={24}/></span>}
    <span><small>Produto relacionado</small><strong>{post.product.name}</strong>
     <b>{formatBRL(price)}</b></span>
    <span className="pope-feed-product-action">Ver produto</span>
   </Link>:null}
  {post.category?<Link className="pope-feed-category"
   href={'/?categoria='+encodeURIComponent(post.category.slug)+'#destaques'}>
    <Tags size={15}/>{post.category.name}
   </Link>:null}
  <footer className="pope-feed-card-footer">
   {post.status==='published'?<FeedLike postId={post.id} userId={userId}
    count={post.like_count} liked={liked}/>:
    <span className="pope-feed-review-note"><ShieldCheck size={15}/>
     {post.status==='pending'?'Aguardando moderação':post.status==='rejected'?
      'Postagem não aprovada':'Postagem não visível no feed'}</span>}
  </footer>
 </article>;
}
