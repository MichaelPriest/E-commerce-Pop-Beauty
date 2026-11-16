import Link from 'next/link';
import { ArrowRight, Gift, ShieldCheck, Sparkles, Truck, CreditCard, Heart } from 'lucide-react';
import {getProducts,getCatalogCategories} from '@/lib/catalog';
import {sortedCategoryTree} from '@/lib/catalog-category-core';
import {catalogPageHref,normalizeCatalogPage} from '@/lib/catalog-query-core';
import { ProductCard } from '@/components/product-card';

const categoryAppearance:Record<string,{emoji:string;tone:string}>={
 make:{emoji:'💄',tone:'pink'},
 skincare:{emoji:'🧴',tone:'aqua'},
 acessorios:{emoji:'🖌️',tone:'purple'},
 kits:{emoji:'🎁',tone:'yellow'}
};
export default async function Home({searchParams}:{searchParams:Promise<{q?:string;categoria?:string;pagina?:string}>}) {
 const filters=await searchParams;
 const [catalog,categoryRows]=await Promise.all([
  getProducts({q:filters.q,category:filters.categoria,
   page:normalizeCatalogPage(filters.pagina)}),
  getCatalogCategories()
 ]);
 const {products:visible,demo,total,page,totalPages,q,category:cat,categoryLabel}=catalog;
 const categoryTree=sortedCategoryTree(categoryRows);
 const pages=Array.from({length:Math.min(5,totalPages)},(_,index)=>
  Math.max(1,Math.min(page-2,totalPages-4))+index);
 return <>
  <div className="demo-banner">{demo?'🚧 Vitrine de demonstração: produtos, preços e condições são ilustrativos.':'🚧 Vitrine em implantação: catálogo ativo, mas pagamentos e checkout ainda estão indisponíveis.'} Pedidos não estão habilitados.</div>
  <section className="hero"><div className="container hero-inner">
   <div className="hero-copy"><div className="eyebrow"><Sparkles size={19}/> BEM-VINDA À POPÊ BEAUTY</div>
   <h1>Beleza acessível,<br/><em>sempre com alto astral!</em> <span>💖</span></h1>
   <p>Make, skincare e acessórios para você brilhar todos os dias — do seu jeitinho.</p>
   <Link href="/#destaques" className="hero-button">Conheça a Popê <ArrowRight size={19}/></Link>
   <div className="hero-tagline">💄 Make <span>•</span> 🧴 Skincare <span>•</span> 🎁 Kits</div></div>
   <div className="hero-illustration" aria-label="Ilustração de maquiagem e beleza"><div className="halo"></div><span className="float-heart h1">♥</span><span className="float-heart h2">✦</span><span className="hero-product lipstick">💄</span><span className="hero-product brush">🖌️</span><span className="hero-product bottle">🧴</span><span className="hero-product gift">🎁</span><div className="hero-sticker">Sua dose diária<br/>de autoestima ✨</div></div>
  </div></section>
  <section className="benefits container"><div><Truck/><span><strong>Frete e entregas</strong><small>Consulte condições na finalização</small></span></div><div><CreditCard/><span><strong>Pagamento</strong><small>Em preparação</small></span></div><div><ShieldCheck/><span><strong>Compra segura</strong><small>Ambiente protegido</small></span></div><div><Gift/><span><strong>Kits especiais</strong><small>Surpresas para você</small></span></div></section>
  <section className="container section" id="categorias"><div className="section-heading"><div><div className="section-kicker">ESCOLHA SEU FAVORITO</div><h2>Compre por <em>categoria</em> <span>💗</span></h2></div></div>
   <div className="categories">{categoryTree.map(root=>{
    const appearance=categoryAppearance[root.slug]??{emoji:'🎀',tone:'pink'};
    return <div className="pope-category-tile" key={root.id}>
     <Link className={'category category-'+appearance.tone}
      href={'/?categoria='+encodeURIComponent(root.slug)+'#destaques'}>
      <span className="category-emoji">{appearance.emoji}</span>
      <strong>{root.name}</strong><ArrowRight size={16}/>
     </Link>
     {root.children.length?<nav className="pope-subcategory-nav"
      aria-label={'Subcategorias de '+root.name}>
      {root.children.map(child=><Link key={child.id}
       href={'/?categoria='+encodeURIComponent(child.slug)+'#destaques'}>
       {child.name}
      </Link>)}
     </nav>:null}
    </div>;
   })}</div>
  </section>
  <section className="container section" id="destaques"><div className="section-heading"><div><div className="section-kicker">ESCOLHIDOS PARA VOCÊ</div><h2>{q?'Resultado da busca':cat?categoryLabel:'Nossos'} <em>{q?'':cat?'':'queridinhos'}</em> <Heart size={25} fill="#ff489d" color="#ff489d"/></h2></div><Link href="/" className="text-link">Ver todos <ArrowRight size={16}/></Link></div>
   <form className="pope-catalog-search" action="/" method="get" role="search" aria-label="Buscar produtos">
    {cat?<input type="hidden" name="categoria" value={cat}/>:null}
    <label htmlFor="pope-search-catalog">Buscar no catálogo</label>
    <div className="pope-catalog-search-line">
     <input id="pope-search-catalog" name="q" type="search" maxLength={60}
      placeholder="Nome, marca ou descrição" defaultValue={q}/>
     <button type="submit" className="admin-primary">Buscar</button>
     {(q||cat)?<Link href="/#destaques" className="admin-outline">Limpar</Link>:null}
    </div>
   </form>
   <p className="pope-catalog-count" aria-live="polite">
    {total} {total===1?'produto encontrado':'produtos encontrados'}
    {totalPages>0?' · Página '+page+' de '+totalPages:''}
   </p>
   <div className="product-grid">{visible.map(p=><ProductCard key={p.id} product={p} demo={demo}/>)}</div>
   {totalPages>1?<nav className="pope-catalog-pagination" aria-label="Páginas de produtos">
    {page>1?<Link href={catalogPageHref({q,category:cat,page:page-1})}>Anterior</Link>:null}
    {pages.map(n=><Link key={n} href={catalogPageHref({q,category:cat,page:n})}
     aria-current={page===n?'page':undefined} className={page===n?'is-current':''}>{n}</Link>)}
    {page<totalPages?<Link href={catalogPageHref({q,category:cat,page:page+1})}>Próxima</Link>:null}
   </nav>:null}
   {visible.length===0?<div className="empty-state">Nenhum produto encontrado. {demo?'Tente outra busca.':'O catálogo será disponibilizado em breve.'}</div>:null}
  </section>
  <section className="container promo-section" id="achadinhos"><div className="promo-copy"><span>✦ APROVEITE</span><h2>Achadinhos<br/>da <em>Popê</em> 💕</h2><p>Uma seleção especial de beleza para todos os estilos e bolsos.</p><Link href="/#destaques" className="promo-button">Descobrir produtos <ArrowRight size={17}/></Link></div><div className="promo-art">💄 <span>🧴</span> 🎁</div></section>
 </>;
}
