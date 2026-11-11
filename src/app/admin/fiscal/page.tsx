import {requireAdmin} from '@/lib/admin';
import {FiscalManager} from './fiscal-manager';
export const dynamic='force-dynamic';
export const metadata={title:'Preparação fiscal e documentos | Popê Beauty'};
export default async function FiscalPage(){
 const sb=await requireAdmin();
 const [issuer,products,orders,drafts,recipients,packages]=await Promise.all([
  sb.from('fiscal_issuer_settings').select('*').eq('id',1).maybeSingle(),
  sb.from('products')
   .select('id,name,brand,is_adult,active,product_fiscal_details(ncm,cest,tax_origin,commercial_unit,cfop_sale,icms_cst,csosn,pis_cst,cofins_cst,cst_ibs_cbs,class_trib_ibs_cbs)')
   .order('name').limit(250),
  sb.from('orders').select('id,status,origin,channel,total_cents,created_at,shipping_address_snapshot,order_items(sku_snapshot,title_snapshot,quantity,unit_price_cents,variant_id)')
   .eq('origin','admin_manual').order('created_at',{ascending:false}).limit(100),
  sb.from('fiscal_order_drafts').select('order_id,fiscal_model,operation_nature,review_notes'),
  sb.from('fiscal_order_recipients').select('order_id,full_name,tax_id,state_registration'),
  sb.from('internal_package_preparations').select('order_id,volumes,packing_notes,weight_g')
 ]);
 const fail=[issuer.error,products.error,orders.error,drafts.error,recipients.error,packages.error].find(Boolean);
 if(fail)return <div className="container admin-workspace"><h1>Preparação fiscal</h1>
  <p className="form-error" role="alert">Falha ao consultar a preparação fiscal: {fail.message}</p></div>;
 return <FiscalManager issuer={issuer.data as any} products={(products.data??[]) as any}
  orders={(orders.data??[]) as any} drafts={(drafts.data??[]) as any}
  recipients={(recipients.data??[]) as any} packages={(packages.data??[]) as any}/>;
}
