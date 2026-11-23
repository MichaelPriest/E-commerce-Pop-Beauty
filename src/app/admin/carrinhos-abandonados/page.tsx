import Link from 'next/link';
import {ArrowLeft,ShoppingCart,ShieldCheck} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {
 CART_RETENTION_DAYS,cartRecoveryStatus,type SavedCartRow
} from '@/lib/cart-recovery-core';
import {
 AbandonedCartsManager,type AbandonedCartRow
} from '@/components/abandoned-carts-manager';

export const dynamic='force-dynamic';
export const metadata={title:'Carrinhos abandonados | Popê Beauty',
 robots:{index:false,follow:false}};

export default async function AbandonedCartsAdminPage(){
 const sb=await requireAdmin();
 const threshold=new Date(Date.now()-CART_RETENTION_DAYS*86_400_000).toISOString();
 const [savedResult,demoResult]=await Promise.all([
  sb.from('customer_saved_carts')
   .select('user_id,items,item_count,last_activity_at,created_at,reminders_opt_in,review_state,reviewed_at')
   .gte('last_activity_at',threshold).order('last_activity_at',{ascending:false}).limit(220),
  sb.from('demo_cart_scenarios')
   .select('id,scenario_title,product_id,quantity,age_minutes,reminders_opt_in,review_state,reviewed_at,has_later_order,created_at')
   .order('scenario_title').limit(30)
 ]);
 const {data:raw,error}=savedResult;
 if(demoResult.error)return <div className="container admin-workspace">
  <h1>Carrinhos abandonados</h1>
  <p role="alert" className="form-error">A consulta de cenários de teste falhou:
   {demoResult.error.message}</p>
 </div>;
 const demoCases=demoResult.data??[];
 if(error)return <div className="container admin-workspace">
  <h1>Carrinhos abandonados</h1><p className="form-error" role="alert">
   Não foi possível consultar os carrinhos: {error.message}</p></div>;
 const carts=(raw??[]) as SavedCartRow[];
 const ids=carts.map(r=>r.user_id);
 const productIds=[...new Set([
  ...carts.flatMap(r=>(r.items??[]).map(i=>i.product_id)),
  ...demoCases.flatMap(c=>c.product_id?[c.product_id]:[])
 ])];
 const oldest=carts.length?carts.reduce((min,row)=>row.last_activity_at<min?
  row.last_activity_at:min,carts[0].last_activity_at):threshold;
 const [profileResult,productsResult,ordersResult]=await Promise.all([
  ids.length?sb.from('profiles').select('id,display_name,role')
   .in('id',ids).limit(300):Promise.resolve({data:[],error:null}),
  productIds.length?sb.from('products')
   .select('id,name,slug,price_cents,active,is_adult')
   .in('id',productIds).eq('is_adult',false).limit(300):
   Promise.resolve({data:[],error:null}),
  ids.length?sb.from('orders').select('customer_id,created_at,status')
   .eq('storefront_order',true).in('customer_id',ids)
   .in('status',['pending','paid','packing','shipped','delivered'])
   .gte('created_at',oldest).order('created_at',{ascending:false}).limit(2000):
   Promise.resolve({data:[],error:null})
 ]);
 if(profileResult.error||productsResult.error||ordersResult.error){
  return <div className="container admin-workspace">
   <h1>Carrinhos abandonados</h1>
   <p role="alert" className="form-error">Não foi possível validar os carrinhos
    contra o catálogo e os pedidos existentes.</p></div>;
 }
 const names=new Map((profileResult.data??[]).map(p=>[p.id,p.display_name]));
 const products=(productsResult.data??[]).filter(p=>p.active&&!p.is_adult)
  .map(p=>({id:p.id,name:p.name,slug:p.slug,price_cents:p.price_cents}));
 const byOrder=new Map<string,string[]>();
 for(const o of ordersResult.data??[]){
  if(!o.customer_id)continue;
  byOrder.set(o.customer_id,[...(byOrder.get(o.customer_id)??[]),o.created_at]);
 }
 const now=Date.now();
 const rows:AbandonedCartRow[]=carts.map(c=>({
  ...c,customer_name:names.get(c.user_id)??'Cliente sem nome',
  products:products.filter(p=>c.items.some(x=>x.product_id===p.id)),
  status:cartRecoveryStatus(c,byOrder.get(c.user_id)??[],now)
 }));
 const demoRows:AbandonedCartRow[]=demoCases.map(c=>{
  const lastActivity=new Date(now-c.age_minutes*60_000).toISOString();
  const lines=c.product_id&&c.quantity>0?
   [{product_id:c.product_id,variant_id:null,quantity:c.quantity}]:[];
  const base:SavedCartRow={
   user_id:c.id,items:lines,item_count:c.quantity,
   last_activity_at:lastActivity,created_at:c.created_at,
   reminders_opt_in:c.reminders_opt_in,
   review_state:c.review_state as SavedCartRow['review_state'],
   reviewed_at:c.reviewed_at
  };
  const fakeOrders=c.has_later_order?
   [new Date(Date.parse(lastActivity)+10*60_000).toISOString()]:[];
  return {...base,customer_name:c.scenario_title,
   products:products.filter(p=>lines.some(x=>x.product_id===p.id)),
   status:cartRecoveryStatus(base,fakeOrders,now)};
 });
 return <div className="container admin-workspace pope-cart-admin">
  <div className="admin-top">
   <div><div className="section-kicker">VENDAS E CLIENTES • POPÊ BEAUTY</div>
    <h1><ShoppingCart size={28}/> Carrinhos abandonados</h1>
    <p>Monitore carrinhos salvos de clientes autenticados, com
     inatividade de pelo menos 60 minutos e sem pedido iniciado depois da última alteração.</p>
   </div>
   <Link href="/admin/clientes" className="admin-outline">
    <ArrowLeft size={17}/> Clientes
   </Link>
  </div>
  <p className="pope-feed-team-note"><ShieldCheck size={18}/>
   Esta visão não inclui visitantes anônimos. Não representa faturamento perdido.
   As informações operacionais ficam disponíveis apenas para administradores.</p>
  <h2 className="pope-demo-section-title">Carrinhos reais</h2>
  <AbandonedCartsManager rows={rows}/>
  <hr className="pope-demo-divider"/>
  <h2 className="pope-demo-section-title">Cenários simulados para homologação</h2>
  <AbandonedCartsManager rows={demoRows} demo/>
 </div>;
}
