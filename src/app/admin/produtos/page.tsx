import Link from 'next/link';
import { readAdminProductCosts, requireAdmin } from '@/lib/admin';
import type {AdminProduct,Category} from '@/types/admin';
import { ProductsManager } from './products-manager';
export const dynamic='force-dynamic';
export default async function AdminProductsPage() {
 const supabase = await requireAdmin();
 const [categoriesResult, productsResult] = await Promise.all([
  supabase.from('categories').select('id,name,is_adult,slug,parent_id,position,active').order('position'),
  supabase.from('products')
   .select('id,slug,name,brand,description,category_id,price_cents,compare_at_cents,image_url,active,is_adult,created_at,categories(id,name,is_adult),variants(id,sku,name,shade,ean,active,inventory(on_hand,reserved,safety_stock),inventory_lots(id,lot_code,expires_at,on_hand))')
   .order('created_at',{ascending:false}).limit(250),
 ]);
 const products=(productsResult.data??[]) as unknown as Omit<AdminProduct,'cost_cents'>[];
 const {costs,error:costError}=await readAdminProductCosts(supabase,products.map(p=>p.id));
 const error=categoriesResult.error||productsResult.error||costError;
 if(error)
  return <div className="container admin-workspace"><h1>Cadastro de produtos</h1><p role="alert" className="form-error">Falha ao carregar catálogo: {error.message}</p><Link href="/admin">Voltar</Link></div>;
 return <ProductsManager initialProducts={products.map(p=>({...p,cost_cents:costs.get(p.id)??0}))}
   categories={(categoriesResult.data??[]) as Category[]}/>;
}
