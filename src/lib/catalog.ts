import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { type Product, demoProducts } from './products';
export { formatBRL } from './products';

export async function getProducts(): Promise<{products:Product[]; demo:boolean}> {
  if (!isSupabaseConfigured()) return { products: demoProducts, demo: true };
  const supabase = await createClient();
  const {data, error} = await supabase.from('products').select('id,slug,name,description,brand,price_cents,compare_at_cents,image_url,categories(name)').eq('active',true).eq('is_adult',false).order('created_at',{ascending:false}).limit(24);
  if (error) { console.error('Falha ao carregar catálogo:',error.code); return { products:[], demo:false }; }
  const products = (data ?? []).map((p: any) => ({
    id:p.id,slug:p.slug,name:p.name,description:p.description??'',brand:p.brand??'',price_cents:p.price_cents,
    compare_at_cents:p.compare_at_cents,image_url:p.image_url,category:p.categories?.name??'Beleza',
  })) as Product[];
  return products.length ? { products, demo:false } : { products:demoProducts, demo:true };
}
