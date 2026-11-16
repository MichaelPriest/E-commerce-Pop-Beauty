import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ArrowLeft} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {GalleryManager,type GalleryPhoto} from './gallery-manager';

export const dynamic='force-dynamic';
export const metadata={title:'Fotos do produto | Popê Beauty'};
const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export default async function ProductGalleryAdmin({
 params,searchParams
}:{params:Promise<{id:string}>;searchParams:Promise<{sku?:string}>}){
 const {id}=await params;
 if(!uuid.test(id))notFound();
 const sb=await requireAdmin();
 const {data:product,error}=await sb.from('products')
  .select('id,name,slug,image_url,is_adult,active,variants(id,sku,name,shade,active)')
  .eq('id',id).maybeSingle();
 if(error)throw new Error('Não foi possível consultar o produto.');
 if(!product)notFound();
 if(product.is_adult)return <div className="container admin-workspace">
  <div className="admin-top"><h1>Galeria do produto</h1>
   <Link className="admin-outline" href="/admin/produtos">
    <ArrowLeft size={16}/> Voltar</Link></div>
  <p className="ops-info">A galeria pública é desativada para produtos +18.
   As imagens desse módulo devem permanecer no armazenamento privado de acesso restrito.</p>
 </div>;
 const {data,error:galleryError}=await sb.from('product_gallery_images')
  .select('id,storage_path,alt_text,sort_order,created_at,variant_id')
  .eq('product_id',id).order('sort_order',{ascending:true})
  .order('created_at',{ascending:true}).limit(8);
 if(galleryError)throw new Error('Não foi possível carregar a galeria.');
 const photos=(data??[]).map(photo=>({
  ...photo,
  url:sb.storage.from('product-images').getPublicUrl(photo.storage_path).data.publicUrl
 }));
 const {sku}=await searchParams;
 const variants=(product.variants??[]).map(v=>({
  id:v.id,sku:v.sku,name:v.name,shade:v.shade,active:v.active
 }));
 const initialVariantId=typeof sku==='string'&&variants.some(v=>v.id===sku)?
  sku:'';
 return <GalleryManager product={product} photos={photos as GalleryPhoto[]}
  variants={variants} initialVariantId={initialVariantId}/>;
}
