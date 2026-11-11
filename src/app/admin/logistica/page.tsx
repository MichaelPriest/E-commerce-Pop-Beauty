import {requireAdmin} from '@/lib/admin';
import {LogisticsManager} from './logistics-manager';
import type {OrderRow} from '@/types/operations';
export const dynamic='force-dynamic';
export default async function LogisticsPage(){
 const sb=await requireAdmin();
 const {data,error}=await sb.from('orders')
   .select('id,customer_id,channel,origin,status,total_cents,created_at,carrier,tracking_code,payment_reference,order_items(id,sku_snapshot,title_snapshot,quantity,unit_price_cents),order_events(id,event_type,note,created_at)')
   .in('status',['paid','packing','shipped','delivered'])
   .order('created_at',{ascending:false}).limit(200);
 if(error)return <div className="container admin-workspace"><h1>Logística</h1><p role="alert" className="form-error">{error.message}</p></div>;
 return <LogisticsManager orders={(data??[]) as unknown as OrderRow[]}/>;
}
