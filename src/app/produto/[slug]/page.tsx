import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getProductBySlug,getProductDetailExtras} from '@/lib/catalog';
import {ProductDetailsShop} from '@/components/product-details-shop';
import {ProductReviews} from '@/components/product-reviews';
import {getStorefrontCustomer} from '@/lib/storefront-customer';
import {isSupabaseConfigured} from '@/lib/supabase/config';
import {createClient} from '@/lib/supabase/server';
import type {ProductReview} from '@/lib/product-reviews-core';
export default async function ProductPage({params,searchParams}:{
 params:Promise<{slug:string}>;searchParams:Promise<{variacao?:string}>
}){
 const {slug}=await params;
 const {variacao}=await searchParams;
 const {product,demo}=await getProductBySlug(slug);
 if(!product)notFound();
 const extras=await getProductDetailExtras(product.id);
 const customer=await getStorefrontCustomer();
 let reviews:ProductReview[]=[];
 let mine:ProductReview|null=null;
 let summary={average_rating:0,rating_count:0};
 if(!demo&&isSupabaseConfigured()&&!product.is_adult){
  const db=await createClient();
  const [comments,stats,myReview]=await Promise.all([
   db.from('product_reviews')
    .select('id,product_id,user_id,author_name,rating,comment,status,created_at,updated_at')
    .eq('product_id',product.id).eq('status','published')
    .order('created_at',{ascending:false}).limit(20),
   db.rpc('product_review_summary',{p_product_id:product.id}).maybeSingle(),
   customer?db.from('product_reviews')
    .select('id,product_id,user_id,author_name,rating,comment,status,created_at,updated_at')
    .eq('product_id',product.id).eq('user_id',customer.id).maybeSingle():
    Promise.resolve({data:null,error:null})
  ]);
  reviews=(comments.data??[]) as ProductReview[];
  mine=(myReview.data??null) as ProductReview|null;
  if(!stats.error&&stats.data){
   const result=stats.data as {average_rating?:number|string;rating_count?:number|string};
   summary={average_rating:Number(result.average_rating)||0,
    rating_count:Number(result.rating_count)||0};
  }
 }
 return <div className="container product-page">
  <nav className="breadcrumbs" aria-label="Caminho da página">
   <Link href="/">Início</Link> / <Link href="/#destaques">Produtos</Link> / {product.name}
  </nav>
  <p className="demo-alert">{demo?
   'Demonstração: não é possível realizar uma compra real.':
   'A loja está em implantação; pedidos e pagamentos comerciais continuam desativados.'}</p>
  <ProductDetailsShop product={product} demo={demo}
   variants={extras.variants} gallery={extras.gallery} ratingSummary={summary}
   initialVariantId={typeof variacao==='string'?variacao:''}/>
  {!product.is_adult?<div id="avaliacoes" className="pope-product-reviews-anchor"><ProductReviews productId={product.id} customerId={customer?.id??null}
   reviews={reviews} summary={summary} mine={mine} demo={demo}
   staffViewer={customer?.role==='admin'||customer?.role==='staff'}/>
   <p className="pope-feed-product-discover">Quer ver vídeos e dicas sobre este produto? <Link href={"/feed?produto="+encodeURIComponent(product.slug)}>Ver publicações no Feed Popê</Link></p></div>:null}
 </div>;
}
