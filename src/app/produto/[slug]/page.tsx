import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getProductBySlug,getProductDetailExtras} from '@/lib/catalog';
import {ProductDetailsShop} from '@/components/product-details-shop';
export default async function ProductPage({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;
 const {product,demo}=await getProductBySlug(slug);
 if(!product)notFound();
 const extras=await getProductDetailExtras(product.id);
 return <div className="container product-page">
  <nav className="breadcrumbs" aria-label="Caminho da página">
   <Link href="/">Início</Link> / <Link href="/#destaques">Produtos</Link> / {product.name}
  </nav>
  <p className="demo-alert">{demo?
   'Demonstração: não é possível realizar uma compra real.':
   'A loja está em implantação; pedidos e pagamentos comerciais continuam desativados.'}</p>
  <ProductDetailsShop product={product} demo={demo}
   variants={extras.variants} gallery={extras.gallery}/>
 </div>;
}
