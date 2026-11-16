import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProductBySlug,formatBRL } from '@/lib/catalog';
import { ProductCard } from '@/components/product-card';
import { ShieldCheck, Truck } from 'lucide-react';
import {productImageSrc} from '@/lib/products';
export default async function ProductPage({params}:{params:Promise<{slug:string}>}) {
 const {slug}=await params; const {product,demo}=await getProductBySlug(slug);
 if(!product) notFound();
 return <div className="container product-page">
 <div className="breadcrumbs"><Link href="/">Início</Link> / <Link href="/#destaques">Produtos</Link> / {product.name}</div>
 <p className="demo-alert">{demo?'Demonstração: este item não está disponível para compra real.':'A Popê Beauty ainda não está recebendo pedidos ou pagamentos.'}</p>
 <div className="product-layout">
 <div className={'detail-visual tone-'+(product.tone||'pink')}>{productImageSrc(product.image_url)?<img src={productImageSrc(product.image_url)!} alt={product.name}/>:<span>{product.emoji||'💖'}</span>}</div>
 <div className="detail-content"><span className="section-kicker">{product.category} • {product.brand}</span><h1>{product.name}</h1><p>{product.description}</p>
 <div className="stars">✦ Novidade na Popê</div>
 {product.compare_at_cents?<del>{formatBRL(product.compare_at_cents)}</del>:null}
 <strong className="detail-price">{formatBRL(product.price_cents)}</strong>
 <p className={'pope-product-stock'+(product.availability==='ready'?' is-available':' is-unavailable')}>
  {demo?'Produto de demonstração':
   product.availability==='ready'?'Estoque disponível para prévia de checkout':
   product.availability==='out_of_stock'?'Produto esgotado':
   product.availability==='variant_selection_required'?
    'Este produto possui opções. A escolha de variação está em implantação.':
    'Produto indisponível no momento'}
 </p>
 <p className="muted">A loja ainda não recebe pedidos nem pagamentos online.
  Os preços e a disponibilidade serão revalidados no checkout.</p>
 <ProductCard product={product} demo={demo}/>
 <div className="trust-lines"><span><ShieldCheck/> Ambiente protegido</span><span><Truck/> Entrega sob consulta</span></div></div></div></div>;
}
