import Link from 'next/link';
import {Heart,ImagePlus,MessageCircle,Filter,ArrowRight,Users,ShieldCheck} from 'lucide-react';
import {createClient} from '@/lib/supabase/server';
import {isSupabaseConfigured} from '@/lib/supabase/config';
import {getStorefrontCustomer} from '@/lib/storefront-customer';
import {FEED_POST_COLUMNS,feedPostViews,feedRows,feedTargets} from '@/lib/feed-server';
import {feedCategoryIds,feedPage} from '@/lib/feed-core';
import {FeedCard} from '@/components/feed-card';

export const dynamic='force-dynamic';
export const metadata={title:'Comunidade e Feed | Popê Beauty',
 description:'Dicas, tutoriais e experiências com os produtos Popê Beauty.'};

export default async function FeedPage({searchParams}:{
 searchParams:Promise<{pagina?:string;categoria?:string;produto?:string}>;
}){
 const params=await searchParams;
 const page=feedPage(params.pagina);
 if(!isSupabaseConfigured())return <div className="container pope-feed-page">
  <h1>Comunidade Popê</h1><p>O feed está temporariamente indisponível.</p>
 </div>;
 const db=await createClient();
 const [customer,targets]=await Promise.all([getStorefrontCustomer(),feedTargets(db)]);
 const category=targets.categories.find(c=>c.slug===params.categoria);
 const product=targets.products.find(p=>p.slug===params.produto);
 const categoryFilter=typeof params.categoria==='string'&&params.categoria.length>0;
 const productFilter=typeof params.produto==='string'&&params.produto.length>0;
 let query=db.from('feed_posts').select(FEED_POST_COLUMNS)
  .eq('status','published').order('published_at',{ascending:false})
  .order('id',{ascending:false});
 if(categoryFilter){
  query=query.in('category_id',category?
   feedCategoryIds(category.id,targets.categories):['00000000-0000-0000-0000-000000000000']);
 }
 if(productFilter)query=query.eq('product_id',product?.id??'00000000-0000-0000-0000-000000000000');
 const pageSize=9,start=(page-1)*pageSize;
 const {data,error}=await query.range(start,start+pageSize);
 const hasMore=(data??[]).length>pageSize;
 const posts=await feedPostViews(db,feedRows((data??[]).slice(0,pageSize)));
 const {data:liked}=customer&&posts.length?await db.from('feed_post_likes')
  .select('post_id').eq('user_id',customer.id)
  .in('post_id',posts.map(p=>p.id)):{data:[] as {post_id:string}[]};
 const likedIds=new Set((liked??[]).map(x=>x.post_id));
 function href(n:number){
  const q=new URLSearchParams();
  if(categoryFilter&&category)q.set('categoria',category.slug);
  if(productFilter&&product)q.set('produto',product.slug);
  if(n>1)q.set('pagina',String(n));
  return '/feed'+(q.size?'?'+q.toString():'');
 }
 return <div className="pope-feed-page">
  <header className="pope-feed-hero">
   <div className="container pope-feed-hero-inner">
    <div><span className="section-kicker">BELEZA, CRIATIVIDADE & COMUNIDADE</span>
     <h1>Feed <em>Popê</em> <Heart size={34} fill="currentColor"/></h1>
     <p>Compartilhe seus achadinhos, experiências, dicas de beleza e tutoriais.
      Descubra postagens relacionadas aos produtos da loja.</p>
     <div className="pope-feed-hero-actions">
      {customer?<Link className="admin-primary" href="/feed/criar">
       <ImagePlus size={18}/> Criar postagem</Link>:
       <Link className="admin-primary" href="/entrar">
        <Users size={18}/> Entre para participar</Link>}
      {customer?<Link className="admin-outline" href="/feed/minhas">Minhas postagens</Link>:null}
     </div>
    </div><div className="pope-feed-hero-art" aria-hidden="true">💄 <span>📷</span> ✨</div>
   </div>
  </header>
  <div className="container pope-feed-layout">
   <section className="pope-feed-main" aria-labelledby="pope-feed-heading">
    <div className="pope-feed-section-title">
     <div><span className="section-kicker">INSPIRE-SE COM A COMUNIDADE</span>
      <h2 id="pope-feed-heading"><MessageCircle size={24}/> Publicações</h2>
     </div>
     <Link href="/feed/criar" className="admin-outline"><ImagePlus size={17}/> Postar</Link>
    </div>
    <form className="pope-feed-filters" action="/feed" method="get">
     <Filter size={18}/>
     <label>Categoria ou subcategoria
      <select name="categoria" defaultValue={category?.slug??''}>
       <option value="">Todas</option>
       {targets.categories.map(c=><option key={c.id} value={c.slug}>
        {c.parent_id?targets.categories.find(p=>p.id===c.parent_id)?.name+' / ':''}{c.name}
       </option>)}
      </select>
     </label>
     <label>Produto
      <select name="produto" defaultValue={product?.slug??''}>
       <option value="">Todos os produtos</option>
       {targets.products.map(p=><option key={p.id} value={p.slug}>{p.name}</option>)}
      </select>
     </label>
     <button className="admin-primary" type="submit">Filtrar</button>
     {(categoryFilter||productFilter)?<Link href="/feed" className="admin-outline">Limpar</Link>:null}
    </form>
    {error?<div className="pope-feed-empty" role="alert">
     Não foi possível carregar o feed. Verifique a configuração do módulo.</div>:
     posts.length?<div className="pope-feed-list">
      {posts.map(post=><FeedCard key={post.id} post={post}
       userId={customer?.id??null} liked={likedIds.has(post.id)}/>)}
     </div>:<div className="pope-feed-empty">
      <ImagePlus size={36}/><h3>Nenhuma publicação encontrada</h3>
      <p>{page>1?'Não há mais publicações nesta página.':
       'Ainda não existem publicações aprovadas para esta seleção.'}</p>
      <Link className="admin-outline" href="/feed">Ver todo o feed</Link>
     </div>}
    {(page>1||hasMore)?<nav className="pope-feed-pagination" aria-label="Páginas do feed">
     {page>1?<Link href={href(page-1)}>Anterior</Link>:null}
     <span>Página {page}</span>
     {hasMore?<Link href={href(page+1)}>Próxima <ArrowRight size={15}/></Link>:null}
    </nav>:null}
   </section>
   <aside className="pope-feed-side" aria-label="Sobre o feed">
    <div><Heart size={24}/><h2>Faça parte da Popê</h2>
     <p>Mostre suas ideias e relacione cada dica a uma categoria, subcategoria ou produto.</p>
     <Link href={customer?'/feed/criar':'/entrar'}>Começar <ArrowRight size={16}/></Link>
    </div>
    <div><ShieldCheck size={23}/><h2>Comunidade com moderação</h2>
     <p>Publicações de clientes só aparecem depois da aprovação da equipe.
      Nenhum conteúdo altera preços, pedidos ou estoque.</p>
    </div>
   </aside>
  </div>
 </div>;
}
