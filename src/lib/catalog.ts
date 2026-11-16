import {createClient} from '@/lib/supabase/server';
import {isSupabaseConfigured} from '@/lib/supabase/config';
import {type Product,demoProducts} from './products';
import {
 CATALOG_PAGE_SIZE,normalizeCatalogCategory,normalizeCatalogPage,normalizeCatalogSearch
} from './catalog-query-core';
import {matchingCategoryIds,type CatalogCategory} from './catalog-category-core';
export {formatBRL} from './products';

type Filters={q?:string;category?:string;page?:number};
type Availability={
 product_id:string;active_variant_count:number;
 can_add_to_cart:boolean;status:Product['availability']
};
export type CatalogResult={
 products:Product[];demo:boolean;total:number;page:number;
 totalPages:number;pageSize:number;q:string;category:string;categoryLabel:string;
};

const productColumns='id,slug,name,description,brand,price_cents,compare_at_cents,image_url,categories(name)';
const demoCategories:CatalogCategory[]=[
 {id:'demo-make',slug:'make',name:'Make',parent_id:null,position:1,active:true,is_adult:false},
 {id:'demo-skincare',slug:'skincare',name:'Skincare',parent_id:null,position:2,active:true,is_adult:false},
 {id:'demo-acessorios',slug:'acessorios',name:'Acessórios',parent_id:null,position:3,active:true,is_adult:false},
 {id:'demo-kits',slug:'kits',name:'Kits',parent_id:null,position:4,active:true,is_adult:false}
];
export async function getCatalogCategories():Promise<CatalogCategory[]>{
 if(!isSupabaseConfigured())return demoCategories;
 const sb=await createClient();
 const {data,error}=await sb.from('categories')
  .select('id,slug,name,parent_id,position,active,is_adult')
  .eq('active',true).eq('is_adult',false)
  .order('position',{ascending:true}).order('name',{ascending:true}).limit(150);
 if(error){
  console.error('Falha ao carregar categorias públicas:',error.code);
  return [];
 }
 return (data??[]) as CatalogCategory[];
}
function mapRow(p:Record<string,unknown>):Product{
 const category=(p.categories as {name?:string}|null)?.name??'Beleza';
 return {
  id:String(p.id),slug:String(p.slug),name:String(p.name),description:String(p.description??''),
  brand:String(p.brand??''),price_cents:Number(p.price_cents),
  compare_at_cents:p.compare_at_cents==null?null:Number(p.compare_at_cents),
  image_url:typeof p.image_url==='string'?p.image_url:null,category,
  availability:'unavailable',active_variant_count:0
 };
}
async function attachAvailability(
 sb:Awaited<ReturnType<typeof createClient>>,products:Product[]
):Promise<Product[]>{
 if(!products.length)return products;
 const {data,error}=await sb.rpc('catalog_product_availability',{
  p_product_ids:products.map(p=>p.id)
 });
 if(error){
  console.error('Disponibilidade da vitrine indisponível:',error.code);
  return products; // fail closed: não habilitar botões com status desconhecido
 }
 const byId=new Map(((data??[]) as Availability[]).map(x=>[x.product_id,x]));
 return products.map(p=>{
  const a=byId.get(p.id);
  return {...p,availability:a?.status??'unavailable',
   active_variant_count:a?.active_variant_count??0};
 });
}
export async function getProducts(filters:Filters={}):Promise<CatalogResult>{
 const q=normalizeCatalogSearch(filters.q),category=normalizeCatalogCategory(filters.category);
 const requestedPage=filters.page;
 const page=typeof requestedPage==='number'&&Number.isSafeInteger(requestedPage)
  &&requestedPage>0&&requestedPage<=10000?requestedPage:1;
 const empty=(demo:boolean):CatalogResult=>({
  products:[],demo,total:0,page,totalPages:0,pageSize:CATALOG_PAGE_SIZE,q,category,categoryLabel:category
 });
 if(!isSupabaseConfigured()){
  const selected=demoCategories.find(x=>x.slug===category||
   x.name.toLocaleLowerCase('pt-BR')===category.toLocaleLowerCase('pt-BR'));
  const matching=demoProducts.filter(p=>
   (!category||(selected?.name===p.category))&&
   (!q||[p.name,p.brand,p.category,p.description].join(' ')
     .toLocaleLowerCase('pt-BR').includes(q.toLocaleLowerCase('pt-BR')))
  );
  return {...empty(true),products:matching.slice((page-1)*CATALOG_PAGE_SIZE,page*CATALOG_PAGE_SIZE),
   total:matching.length,totalPages:Math.ceil(matching.length/CATALOG_PAGE_SIZE),
   categoryLabel:selected?.name??category};
 }
 const sb=await createClient();
 let categoryIds:string[]=[];
 let categoryLabel=category;
 if(category){
  // Somente categorias ativas e públicas; a principal inclui subcategorias.
  const catalogCategories=await getCatalogCategories();
  categoryIds=matchingCategoryIds(catalogCategories,category);
  const selected=catalogCategories.find(x=>categoryIds.includes(x.id)&&
   (x.slug===category||x.name.toLocaleLowerCase('pt-BR')===
    category.toLocaleLowerCase('pt-BR')));
  categoryLabel=selected?.name??category;
  if(!categoryIds.length)return empty(false);
 }
 let query=sb.from('products').select(productColumns,{count:'exact'})
  .eq('active',true).eq('is_adult',false);
 if(categoryIds.length)query=query.in('category_id',categoryIds);
 if(q){
  // As vírgulas, parênteses, aspas e curingas foram removidos pela normalização.
  const part='%'+q+'%';
  query=query.or('name.ilike.'+part+',brand.ilike.'+part+',description.ilike.'+part);
 }
 const offset=(page-1)*CATALOG_PAGE_SIZE;
 const {data,error,count}=await query.order('created_at',{ascending:false})
  .order('id',{ascending:false}).range(offset,offset+CATALOG_PAGE_SIZE-1);
 if(error){
  console.error('Falha ao carregar catálogo:',error.code);
  return empty(false);
 }
 const products=(data??[]).map(row=>mapRow(row as unknown as Record<string,unknown>));
 const available=await attachAvailability(sb,products);
 const total=count??0;
 return {products:available,demo:false,total,page,
  totalPages:Math.ceil(total/CATALOG_PAGE_SIZE),pageSize:CATALOG_PAGE_SIZE,
  q,category,categoryLabel};
}
export async function getProductBySlug(slug:string):Promise<{product:Product|null;demo:boolean}>{
 if(typeof slug!=='string'||slug.length>160||!/^[a-z0-9-]+$/i.test(slug))
  return {product:null,demo:false};
 if(!isSupabaseConfigured())
  return {product:demoProducts.find(x=>x.slug===slug)??null,demo:true};
 const sb=await createClient();
 const {data,error}=await sb.from('products').select(productColumns)
  .eq('slug',slug).eq('active',true).eq('is_adult',false).maybeSingle();
 if(error){
  console.error('Produto indisponível:',error.code);
  return {product:null,demo:false};
 }
 if(!data)return {product:null,demo:false};
 const products=await attachAvailability(sb,[mapRow(data as unknown as Record<string,unknown>)]);
 return {product:products[0]??null,demo:false};
}


export type CatalogVariant={
 product_id:string;variant_id:string;sku:string;name:string;
 shade:string|null;available:boolean
};
export type ProductGalleryPhoto={id:string;url:string;alt:string;variant_id:string|null};
export async function getProductDetailExtras(productId:string):
 Promise<{variants:CatalogVariant[];gallery:ProductGalleryPhoto[]}>{
 if(!isSupabaseConfigured()||
  !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(productId))
  return {variants:[],gallery:[]};
 const sb=await createClient();
 const [variantResult,galleryResult]=await Promise.all([
  sb.rpc('catalog_variant_availability',{p_product_ids:[productId]}),
  sb.from('product_gallery_images').select('id,storage_path,alt_text,variant_id')
   .eq('product_id',productId).order('sort_order',{ascending:true})
   .order('created_at',{ascending:true}).limit(8)
 ]);
 if(variantResult.error)console.error('Variações indisponíveis:',variantResult.error.code);
 if(galleryResult.error)console.error('Galeria indisponível:',galleryResult.error.code);
 return {
  variants:variantResult.error?[]:((variantResult.data??[]) as CatalogVariant[]),
  gallery:galleryResult.error?[]:(galleryResult.data??[]).map(img=>({
   id:img.id,
   url:sb.storage.from('product-images').getPublicUrl(img.storage_path).data.publicUrl,
   alt:img.alt_text||'Foto adicional do produto',
   variant_id:img.variant_id??null
  }))
 };
}
