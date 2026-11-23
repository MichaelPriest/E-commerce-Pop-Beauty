import Link from 'next/link';
import {ArrowLeft,Clapperboard,Play} from 'lucide-react';
import {createClient} from '@/lib/supabase/server';
import {isSupabaseConfigured} from '@/lib/supabase/config';
import {FEED_POST_COLUMNS,feedPostViews,feedRows,feedTargets} from '@/lib/feed-server';
import {feedCategoryIds,feedPage,type FeedPostView} from '@/lib/feed-core';
import {FeedReels} from '@/components/feed-reels';

export const dynamic='force-dynamic';
export const metadata={title:'Vídeos da Popê | Reels de beleza',
 description:'Assista a vídeos e tutoriais de beleza da equipe Popê, com produtos relacionados.'};

export default async function PopêReelsPage({searchParams}:{
 searchParams:Promise<{pagina?:string;produto?:string;categoria?:string}>;
}){
 const args=await searchParams;
 const page=feedPage(args.pagina);
 if(!isSupabaseConfigured())return <div className="container">
  <h1>Vídeos Popê</h1><p>Feed de vídeos indisponível no momento.</p></div>;
 const db=await createClient();
 const targets=await feedTargets(db);
 const product=targets.products.find(p=>p.slug===args.produto);
 const category=targets.categories.find(c=>c.slug===args.categoria);
 let query=db.from('feed_posts').select(FEED_POST_COLUMNS)
  .eq('status','published').eq('media_kind','video')
  .order('published_at',{ascending:false}).order('id',{ascending:false});
 if(args.produto)query=query.eq('product_id',product?.id??'00000000-0000-0000-0000-000000000000');
 if(args.categoria)query=query.in('category_id',category?
  feedCategoryIds(category.id,targets.categories):['00000000-0000-0000-0000-000000000000']);
 const size=8,start=(page-1)*size;
 const {data,error}=await query.range(start,start+size);
 const hasMore=(data??[]).length>size;
 const posts=await feedPostViews(db,feedRows((data??[]).slice(0,size)));
 // A amostra pública é carregada somente quando não existem vídeos oficiais.
 // O clipe CC0 mostra flores, nunca um produto Popê; o conteúdo real não se mistura.
 const demoResult=posts.length===0&&page===1&&!error?
  await db.from('demo_feed_reels')
   .select('id,body,video_url,product_id,category_id,created_at')
   .eq('active',true).limit(3):null;
 const demoVideos:FeedPostView[]=(demoResult?.data??[])
  .filter(d=>(!args.produto||d.product_id===product?.id)&&
   (!args.categoria||!!category&&feedCategoryIds(category.id,targets.categories)
    .includes(d.category_id??'')))
  .map(d=>{
   const selectedProduct=targets.products.find(p=>p.id===d.product_id)??null;
   const selectedCategory=targets.categories.find(cat=>cat.id===d.category_id)??null;
   return {
    id:d.id,author_id:'00000000-0000-4000-8000-000000000000',
    author_name:'Amostra de vídeo (CC0)',body:d.body,
    media_path:null,media_kind:'video' as const,
    media_url:d.video_url,product_id:d.product_id,category_id:d.category_id,
    product:selectedProduct,
    category:selectedCategory?{
     id:selectedCategory.id,name:selectedCategory.name,slug:selectedCategory.slug,
     parent_id:selectedCategory.parent_id
    }:null,
    status:'published' as const,
    created_at:d.created_at,updated_at:d.created_at,published_at:d.created_at
   };
  });
 const isDemo=posts.length===0&&demoVideos.length>0;
 const displayVideos=isDemo?demoVideos:posts;
 function href(n:number){
  const params=new URLSearchParams();
  if(args.produto&&product)params.set('produto',product.slug);
  if(args.categoria&&category)params.set('categoria',category.slug);
  if(n>1)params.set('pagina',String(n));
  return '/feed/videos'+(params.size?'?'+params:'');
 }
 return <div className="pope-reels-page">
  <header className="pope-reels-heading container">
   <div><span className="section-kicker">VÍDEOS OFICIAIS POPÊ</span>
    <h1><Clapperboard size={31}/> Popê Vídeos</h1>
    <p>Role para assistir aos tutoriais. Cada vídeo pode levar ao produto apresentado.</p></div>
   <Link href="/feed" className="admin-outline"><ArrowLeft size={17}/> Feed completo</Link>
  </header>
  {error?<div className="container pope-feed-empty" role="alert">
   Não foi possível carregar os vídeos.</div>:
   displayVideos.length?<div className="pope-reels-wrap">
    {isDemo?<div className="pope-demo-label"><strong>VÍDEO DE TESTE — NÃO É CONTEÚDO EDITORIAL DA POPÊ</strong>
     <p>Clipe de flores usado apenas para testar os Reels (fonte MDN, CC0).
      O produto exibido é ilustrativo e não aparece no vídeo.
      Assim que a equipe publicar um vídeo real, ele substituirá esta amostra.</p>
    </div>:null}
    <FeedReels posts={displayVideos}/>
   </div>:
    <div className="container pope-feed-empty">
     <Play size={34}/><h2>Sem vídeos publicados nesta seleção.</h2>
     <p>A equipe Popê pode publicar vídeos na central de conteúdo.</p>
     <Link href="/feed">Ver feed completo</Link>
    </div>}
  {(page>1||hasMore)?<nav className="container pope-feed-pagination"
   aria-label="Páginas de vídeos">
   {page>1?<Link href={href(page-1)}>Vídeos anteriores</Link>:null}
   <span>Página {page}</span>
   {hasMore?<Link href={href(page+1)}>Mais vídeos</Link>:null}
  </nav>:null}
 </div>;
}
