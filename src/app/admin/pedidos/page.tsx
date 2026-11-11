import {requireAdmin} from '@/lib/admin';
import {OrdersManager} from './orders-manager';
import type {OrderRow,SellableSku,CustomerRow} from '@/types/operations';
export const dynamic='force-dynamic';
export default async function OrdersPage(){
 const sb=await requireAdmin();
 const [orders,variants,customers]=await Promise.all([
  sb.from('orders')
   .select('id,customer_id,channel,origin,status,total_cents,created_at,carrier,tracking_code,payment_reference,order_items(id,sku_snapshot,title_snapshot,quantity,unit_price_cents),order_events(id,event_type,note,created_at)')
   .order('created_at',{ascending:false}).limit(200),
  sb.from('variants')
   .select('id,sku,name,shade,products(name,price_cents,active,is_adult),inventory(on_hand,reserved)')
   .eq('active',true).order('sku').limit(500),
  sb.from('profiles').select('id,display_name,role,created_at').order('created_at',{ascending:false}).limit(1000)
 ]);
 if(orders.error||variants.error||customers.error)return <div className="container admin-workspace"><h1>Pedidos</h1><p className="form-error" role="alert">{orders.error?.message||variants.error?.message||customers.error?.message}</p></div>;
 return <OrdersManager orders={(orders.data??[]) as unknown as OrderRow[]}
  variants={(variants.data??[]) as unknown as SellableSku[]}
  customers={(customers.data??[]) as CustomerRow[]}/>;
}
