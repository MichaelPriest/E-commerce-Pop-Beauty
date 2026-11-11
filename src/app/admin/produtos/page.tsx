import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import type {AdminProduct,Category} from '@/types/admin';
import { ProductsManager } from './products-manager';
export const dynamic='force-dynamic';
export default async function AdminProductsPage() {
 const supabase = await requireAdmin();
 const [categoriesResult, productsResult] = await Promise.all([
  supabase.from('categories').select('id,name').eq('active',true).order('position'),
  supabase.from('products')
   .select('id,slug,name,brand,description,category_id,price_cents,cost_cents,compare_at_cents,image_url,active,created_at,categories(id,name),variants(id,sku,name,shade,ean,active,inventory(on_hand,reserved,safety_stock),inventory_lots(id,lot_code,expires_at,on_hand))')
   .order('created_at',{ascending:false}).limit(250),
 ]);
 if(categoriesResult.error || productsResult.error)
  return <div className="container admin-workspace"><h1>Cadastro de produtos</h1><p role="alert" className="form-error">Falha ao carregar catálogo: {categoriesResult.error?.message||productsResult.error?.message}</p><Link href="/admin">Voltar</Link></div>;
 return <ProductsManager initialProducts={(productsResult.data??[]) as unknown as AdminProduct[]}
   categories={(categoriesResult.data??[]) as Category[]}/>;
}
