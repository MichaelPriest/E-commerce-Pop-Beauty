import Link from 'next/link';
import {ArrowLeft,Star,ShieldCheck} from 'lucide-react';
import {requireFeedEditor} from '@/lib/feed-access';
import type {ProductReview} from '@/lib/product-reviews-core';
import {ReviewsManager} from '@/components/reviews-manager';

export async function TeamReviewsWorkspace(){
 const {db,role}=await requireFeedEditor();
 const [real,demo]=await Promise.all([
  db.from('product_reviews')
   .select('id,product_id,user_id,author_name,rating,comment,status,created_at,updated_at,products(name,slug)')
   .order('created_at',{ascending:false}).limit(150),
  db.from('demo_product_review_scenarios')
   .select('id,product_id,author_name,rating,comment,status,created_at,updated_at,products(name,slug)')
   .order('created_at',{ascending:false}).limit(30)
 ]);
 return <div className="container admin-workspace pope-review-team">
  <div className="admin-top">
   <div><div className="section-kicker">POPÊ BEAUTY • REPUTAÇÃO</div>
    <h1><Star size={28}/> Avaliações dos produtos</h1>
    <p>Comentários de clientes com notas de 1 a 5 estrelas.
     Aprove ou oculte avaliações antes de exibi-las na loja.</p>
   </div>
   <Link className="admin-outline" href={role==='admin'?'/admin':'/conta'}>
    <ArrowLeft size={17}/> Voltar
   </Link>
  </div>
  <p className="pope-feed-team-note"><ShieldCheck size={18}/>
   As avaliações não representam compras verificadas, a menos que exista uma
   verificação específica do pedido.</p>
  {real.error?<p className="form-error" role="alert">
   Não foi possível carregar as avaliações reais. Confira a migração product_reviews_v1.sql.
  </p>:<>
   <h2 className="pope-demo-section-title">Avaliações reais de clientes</h2>
   <ReviewsManager reviews={(real.data??[]) as unknown as (
    ProductReview&{products:{name:string;slug:string}|null})[]}/>
  </>}
  <hr className="pope-demo-divider"/>
  <h2 className="pope-demo-section-title">Avaliações simuladas</h2>
  {demo.error?<p className="form-error" role="alert">
   Não foi possível carregar os cenários fictícios: {demo.error.message}
  </p>:<ReviewsManager demo reviews={(demo.data??[]).map(r=>({
   ...r,user_id:r.id
  })) as unknown as (ProductReview&{products:{name:string;slug:string}|null})[]}/>}
 </div>;
}
