'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {CheckCircle2,EyeOff,Clock,Star} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {starsOf,type ProductReview} from '@/lib/product-reviews-core';

type ReviewEntry=ProductReview&{products:{name:string;slug:string}|null};
export function ReviewsManager({reviews}:{reviews:ReviewEntry[]}){
 const router=useRouter();
 const [filter,setFilter]=useState('pending'),[busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState('');
 const visible=reviews.filter(r=>filter==='all'||r.status===filter);
 async function moderate(id:string,status:'pending'|'published'|'hidden'){
  if(busy)return;
  setBusy(id);setError('');
  const {data,error:dbError}=await createClient().from('product_reviews')
   .update({status}).eq('id',id).select('id').maybeSingle();
  if(dbError||!data)setError('Não foi possível atualizar esta avaliação.');
  else router.refresh();
  setBusy(null);
 }
 return <section className="pope-review-admin">
  <div className="pope-review-admin-stats">
   <div><strong>{reviews.filter(x=>x.status==='pending').length}</strong><span>Para aprovar</span></div>
   <div><strong>{reviews.filter(x=>x.status==='published').length}</strong><span>Publicadas</span></div>
   <div><strong>{reviews.filter(x=>x.status==='hidden').length}</strong><span>Ocultas</span></div>
  </div>
  <div className="pope-review-admin-filter">
   <label>Filtrar avaliações
    <select value={filter} onChange={e=>setFilter(e.target.value)}>
     <option value="pending">Aguardando moderação</option>
     <option value="all">Todas</option>
     <option value="published">Publicadas</option>
     <option value="hidden">Ocultas</option>
    </select>
   </label>
  </div>
  {error?<p className="form-error" role="alert">{error}</p>:null}
  {visible.length?<div className="pope-review-admin-list">{visible.map(review=>
   <article key={review.id} className="pope-review-admin-card">
    <div><span className="pope-product-review-stars" aria-label={review.rating+' estrelas'}>
     {starsOf(review.rating)}</span>
     <small>{new Date(review.created_at).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})}</small>
    </div>
    <h3>{review.products?<Link href={'/produto/'+review.products.slug}>
     {review.products.name}</Link>:'Produto excluído'}</h3>
    <p><strong>{review.author_name}</strong> · {review.status==='pending'?
     'Aguardando aprovação':review.status==='published'?'Publicado':'Oculto'}</p>
    <blockquote>{review.comment}</blockquote>
    <div className="pope-feed-moderation-actions">
     {review.status!=='published'?<button className="admin-primary" type="button"
      disabled={!!busy} onClick={()=>moderate(review.id,'published')}>
      <CheckCircle2 size={16}/> Aprovar</button>:null}
     {review.status!=='hidden'?<button className="admin-outline" type="button"
      disabled={!!busy} onClick={()=>moderate(review.id,'hidden')}>
      <EyeOff size={16}/> Ocultar</button>:null}
     {review.status!=='pending'?<button className="admin-outline" type="button"
      disabled={!!busy} onClick={()=>moderate(review.id,'pending')}>
      <Clock size={16}/> Voltar para análise</button>:null}
    </div>
   </article>)}</div>:<div className="pope-feed-empty">
    <Star size={30}/> Nenhuma avaliação nesta situação.</div>}
 </section>;
}
