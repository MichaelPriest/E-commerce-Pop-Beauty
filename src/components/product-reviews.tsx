'use client';
import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {Star,Send,ShieldCheck} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {starsOf,validateProductReview,type ProductReview} from '@/lib/product-reviews-core';

export function ProductReviews({productId,customerId,reviews,summary,mine,demo=false}:{
 productId:string;customerId:string|null;reviews:ProductReview[];
 summary:{average_rating:number;rating_count:number};
 mine:ProductReview|null;demo?:boolean;
}){
 const router=useRouter();
 const [rating,setRating]=useState(0),[comment,setComment]=useState('');
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!customerId||saving||mine||demo)return;
  const issue=validateProductReview(rating,comment);
  if(issue){setError(issue);return;}
  setSaving(true);setError('');setNotice('');
  const {error:dbError}=await createClient().from('product_reviews').insert({
   product_id:productId,user_id:customerId,rating,comment:comment.trim(),status:'pending'
  });
  if(dbError){
   setError(dbError.code==='23505'?
    'Você já enviou uma avaliação para este produto.':
    'Não foi possível enviar a avaliação. Tente novamente.');
  }else{
   setRating(0);setComment('');
   setNotice('Avaliação recebida! Ela ficará em análise antes de aparecer na loja.');
   router.refresh();
  }
  setSaving(false);
 }
 return <section className="pope-product-reviews" aria-labelledby="pope-product-reviews-title">
  <div className="pope-product-reviews-heading">
   <div><span className="section-kicker">OPINIÃO DOS CLIENTES</span>
    <h2 id="pope-product-reviews-title">Avaliações e comentários</h2></div>
   <div className="pope-product-reviews-summary">
    <strong>{summary.rating_count?
     summary.average_rating.toLocaleString('pt-BR',{maximumFractionDigits:1}):'—'}</strong>
    <span aria-label={summary.rating_count?
     'Nota média '+summary.average_rating+' de 5':'Ainda sem avaliação'}>
     {summary.rating_count?starsOf(summary.average_rating):'☆☆☆☆☆'}
    </span>
    <small>{summary.rating_count} {summary.rating_count===1?'avaliação':'avaliações'}</small>
   </div>
  </div>
  {reviews.length?<div className="pope-product-reviews-list">
   {reviews.map(review=><article key={review.id} className="pope-product-review-card">
    <div><strong>{review.author_name}</strong>
     <time dateTime={review.created_at}>
      {new Date(review.created_at).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})}
     </time></div>
    <div className="pope-product-review-stars" aria-label={review.rating+' de 5 estrelas'}>
     {starsOf(review.rating)}
    </div>
    <p>{review.comment}</p>
   </article>)}
  </div>:<p className="pope-product-reviews-empty">
   Ainda não existem avaliações aprovadas para este produto. Seja a primeira pessoa a avaliar.
  </p>}
  <div className="pope-product-review-form">
   <h3>Deixe sua avaliação</h3>
   {demo?<p>As avaliações estarão disponíveis quando o catálogo real estiver ativo.</p>:
    mine?<div className="pope-product-review-already">
     <ShieldCheck size={20}/>
     <div><strong>Você já avaliou este produto.</strong>
      <p>Sua nota: {starsOf(mine.rating)} · {mine.status==='pending'?'Aguardando aprovação':
       mine.status==='published'?'Avaliação publicada':'Avaliação indisponível'}</p>
      <p>{mine.comment}</p>
     </div>
    </div>:
    !customerId?<p>Entre na sua conta para avaliar com estrelas e escrever um comentário.
     {' '}<Link href="/entrar">Entrar na minha conta</Link></p>:
    <form onSubmit={submit}>
     <fieldset className="pope-product-review-rating">
      <legend>Escolha sua nota *</legend>
      <div>{[1,2,3,4,5].map(value=><button type="button" key={value}
       aria-label={value+' '+(value===1?'estrela':'estrelas')}
       aria-pressed={rating===value} disabled={saving}
       onClick={()=>setRating(value)}>
       <Star fill={rating>=value?'currentColor':'none'}/>
      </button>)}</div>
      <small>{rating?rating+' de 5 estrelas':'Selecione de 1 a 5 estrelas'}</small>
     </fieldset>
     <label htmlFor="pope-review-comment">Seu comentário *</label>
     <textarea id="pope-review-comment" minLength={10} maxLength={1200}
      rows={4} required value={comment} disabled={saving}
      placeholder="Conte sua experiência, acabamento, fragrância ou resultado..."
      onChange={e=>setComment(e.target.value)}/>
     <p className="pope-feed-notice"><ShieldCheck size={16}/>
      Comentários passam por moderação. Avaliações não são identificadas automaticamente como compras verificadas.
     </p>
     {error?<p className="form-error" role="alert">{error}</p>:null}
     {notice?<p className="form-success" role="status">{notice}</p>:null}
     <button type="submit" className="admin-primary" disabled={saving}>
      <Send size={17}/>{saving?'Enviando...':'Enviar avaliação'}
     </button>
    </form>}
  </div>
 </section>;
}
