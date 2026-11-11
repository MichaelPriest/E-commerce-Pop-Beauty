import { requireAdmin } from '@/lib/admin';
import type {StockVariant} from '@/types/admin';
import { StockManager } from './stock-manager';
export const dynamic='force-dynamic';
export default async function AdminStockPage(){
 const supabase=await requireAdmin();
 const result=await supabase.from('variants')
 .select('id,sku,name,shade,ean,active,products(id,name,brand,active,price_cents,cost_cents),inventory(on_hand,reserved,safety_stock),inventory_lots(id,lot_code,expires_at,on_hand)')
 .order('sku',{ascending:true}).limit(1000);
 if(result.error) return <div className="container admin-workspace"><h1>Estoque</h1><p className="form-error">{result.error.message}</p></div>;
 return <StockManager variants={(result.data??[]) as unknown as StockVariant[]}/>;
}
