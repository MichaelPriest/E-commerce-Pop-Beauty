import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProducts, formatBRL } from '@/lib/catalog';
import { ProductCard } from '@/components/product-card';
import { ShieldCheck, Truck } from 'lucide-react';
export default async function ProductPage({params}:{params:Promise<{slug:string}>}) {
 const {slug}=await params; const {products,demo}=await getProducts();
 const product=products.find(p=>p.slug===slug); if(!product) notFound();
 return <div className="container product-page">
 <div className="breadcrumbs"><Link href="/">Início</Link> / <Link href="/#destaques">Produtos</Link> / {product.name}</div>
 <p className="demo-alert">{demo?'Demonstração: este item não está disponível para compra real.':'A Popê Beauty ainda não está recebendo pedidos ou pagamentos.'}</p>
 <div className="product-layout">
 <div className={'detail-visual tone-'+(product.tone||'pink')}>{product.image_url?<img src={product.image_url} alt={product.name}/>:<span>{product.emoji||'💖'}</span>}</div>
 <div className="detail-content"><span className="section-kicker">{product.category} • {product.brand}</span><h1>{product.name}</h1><p>{product.description}</p>
 <div className="stars">✦ Novidade na Popê</div>
 {product.compare_at_cents?<del>{formatBRL(product.compare_at_cents)}</del>:null}
 <strong className="detail-price">{formatBRL(product.price_cents)}</strong>
 <p className="muted">O valor final e a disponibilidade serão confirmados quando a loja estiver ativa.</p>
 <ProductCard product={product} demo={demo}/>
 <div className="trust-lines"><span><ShieldCheck/> Ambiente protegido</span><span><Truck/> Entrega sob consulta</span></div></div></div></div>;
}
