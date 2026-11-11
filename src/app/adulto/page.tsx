import Link from 'next/link';
import {notFound} from 'next/navigation';
import {LockKeyhole,ShieldCheck,Heart,ArrowLeft} from 'lucide-react';
import {getAdultStatus} from '@/lib/adult';
import {createClient} from '@/lib/supabase/server';
import {ProductCard} from '@/components/product-card';
import type {Product} from '@/lib/products';
import {AgeRequest} from './request-form';

export const dynamic='force-dynamic';
export default async function AdultCatalogPage(){
 const status=await getAdultStatus();
 if(!status.enabled)notFound();
 if(!status.verified){
  return <div className="container adult-locked">
   <div className="adult-lock-symbol"><LockKeyhole size={38}/></div>
   <div className="section-kicker">PROTEÇÃO DE MENORES</div>
   <h1>Área restrita para maiores de 18 anos</h1>
   <p>Esta seção não exibe produtos, descrições nem imagens antes da verificação confiável de maioridade. Informar apenas a idade não libera o acesso.</p>
   {!status.userId?
    <Link href="/entrar" className="hero-button">Entrar na minha conta</Link>:
    <AgeRequest userId={status.userId} status={status.requestStatus}/>}
   <Link className="adult-back-link" href="/"><ArrowLeft size={16}/> Voltar à loja de beleza</Link>
  </div>;
 }
 const sb=await createClient();
 const {data,error}=await sb.from('products')
  .select('id,slug,name,description,brand,price_cents,compare_at_cents,image_url,categories(name)')
  .eq('active',true).eq('is_adult',true).order('created_at',{ascending:false}).limit(60);
 if(error)return <div className="container account-page"><p role="alert">O catálogo reservado não está disponível.</p></div>;
 const products:Product[]=(data??[]).map((p:any)=>({id:p.id,slug:p.slug,name:p.name,description:p.description||'',brand:p.brand,
  price_cents:p.price_cents,compare_at_cents:p.compare_at_cents,image_url:p.image_url,is_adult:true,
  category:p.categories?.name??'Adulto'}));
 return <div className="container adult-catalog">
  <div className="adult-banner"><div><div className="section-kicker">ACESSO AUTORIZADO +18</div><h1>Bem-estar íntimo</h1><p>Uma seleção reservada, exclusivamente para clientes com maioridade verificada.</p></div><ShieldCheck size={52}/></div>
  <p className="demo-alert">Vitrine sem checkout. Nenhum pedido ou pagamento está habilitado nesta seção.</p>
  {products.length?<div className="product-grid">{products.map(product=><ProductCard key={product.id} product={product} demo={false}/>)}</div>:
   <div className="empty-state"><Heart size={29}/><h2>Em preparação</h2><p>Ainda não existem produtos ativos nesta categoria.</p></div>}
 </div>;
}
