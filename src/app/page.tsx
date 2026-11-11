import Link from 'next/link';
import { ArrowRight, Gift, ShieldCheck, Sparkles, Truck, CreditCard, Heart } from 'lucide-react';
import { getProducts } from '@/lib/catalog';
import { ProductCard } from '@/components/product-card';

const categories = [{name:'Make',emoji:'💄',tone:'pink'},{name:'Skincare',emoji:'🧴',tone:'aqua'},{name:'Acessórios',emoji:'🖌️',tone:'purple'},{name:'Kits',emoji:'🎁',tone:'yellow'}];
export default async function Home({searchParams}:{searchParams:Promise<{q?:string;categoria?:string}>}) {
 const {products,demo}=await getProducts(); const filters=await searchParams;
 const q=(filters.q||'').trim().toLocaleLowerCase('pt-BR'); const cat=filters.categoria||'';
 const visible=products.filter(p=>(!cat||p.category===cat)&&(!q||[p.name,p.brand,p.category].join(' ').toLocaleLowerCase('pt-BR').includes(q)));
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
   <div className="categories">{categories.map(c=><Link key={c.name} className={'category category-'+c.tone} href={'/?categoria='+encodeURIComponent(c.name)+'#destaques'}><span className="category-emoji">{c.emoji}</span><strong>{c.name}</strong><ArrowRight size={16}/></Link>)}</div>
  </section>
  <section className="container section" id="destaques"><div className="section-heading"><div><div className="section-kicker">ESCOLHIDOS PARA VOCÊ</div><h2>{q?'Resultado da busca':cat?cat:'Nossos'} <em>{q?'':cat?'':'queridinhos'}</em> <Heart size={25} fill="#ff489d" color="#ff489d"/></h2></div><Link href="/" className="text-link">Ver todos <ArrowRight size={16}/></Link></div>
   <div className="product-grid">{visible.map(p=><ProductCard key={p.id} product={p} demo={demo}/>)}</div>
   {visible.length===0?<div className="empty-state">Nenhum produto encontrado. {demo?'Tente outra busca.':'O catálogo será disponibilizado em breve.'}</div>:null}
  </section>
  <section className="container promo-section" id="achadinhos"><div className="promo-copy"><span>✦ APROVEITE</span><h2>Achadinhos<br/>da <em>Popê</em> 💕</h2><p>Uma seleção especial de beleza para todos os estilos e bolsos.</p><Link href="/#destaques" className="promo-button">Descobrir produtos <ArrowRight size={17}/></Link></div><div className="promo-art">💄 <span>🧴</span> 🎁</div></section>
 </>;
}
