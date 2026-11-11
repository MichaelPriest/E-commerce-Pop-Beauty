import Link from 'next/link';
import {redirect,notFound} from 'next/navigation';
import {ShieldCheck} from 'lucide-react';
import {getAdultStatus} from '@/lib/adult';
import {createClient} from '@/lib/supabase/server';
import {formatBRL,productImageSrc} from '@/lib/products';
export const dynamic='force-dynamic';
export default async function AdultProductPage({params}:{params:Promise<{slug:string}>}){
 const status=await getAdultStatus();
 if(!status.enabled)notFound();
 if(!status.verified)redirect('/adulto');
 const {slug}=await params;
 const sb=await createClient();
 const {data:p,error}=await sb.from('products')
  .select('id,slug,name,description,brand,price_cents,compare_at_cents,image_url,categories(name)')
  .eq('slug',slug).eq('active',true).eq('is_adult',true).maybeSingle();
 if(error||!p)notFound();
 const img=productImageSrc(p.image_url);
 return <div className="container product-page">
  <div className="breadcrumbs"><Link href="/adulto">Área +18</Link> / {p.name}</div>
  <p className="demo-alert">Apenas apresentação do produto. A compra e o pagamento ainda não estão disponíveis.</p>
  <div className="product-layout"><div className="detail-visual tone-purple">{img?<img src={img} alt={p.name}/>:<span>🔒</span>}</div>
  <div className="detail-content"><span className="section-kicker">ACESSO EXCLUSIVO +18</span><h1>{p.name}</h1><p>{p.description}</p>
  {p.compare_at_cents?<del>{formatBRL(p.compare_at_cents)}</del>:null}
  <strong className="detail-price">{formatBRL(p.price_cents)}</strong>
  <div className="trust-lines"><span><ShieldCheck size={18}/> Acesso protegido por verificação de maioridade</span></div>
  <Link href="/adulto" className="adult-back-link">Voltar à seção reservada</Link>
  </div></div></div>;
}
