import Link from 'next/link';
import {Users,ShieldCheck,ShoppingBag} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {CustomerTable} from './customer-table';
import type {CustomerRow} from '@/types/operations';
export const dynamic='force-dynamic';
export default async function CustomersPage(){
 const sb=await requireAdmin();
 const [profiles,orders]=await Promise.all([
  sb.from('profiles').select('id,display_name,role,created_at').order('created_at',{ascending:false}).limit(1000),
  sb.from('orders').select('customer_id,total_cents,status').not('customer_id','is',null).limit(3000)
 ]);
 if(profiles.error||orders.error)return <div className="container admin-workspace"><h1>Clientes</h1><p role="alert" className="form-error">{profiles.error?.message||orders.error?.message}</p></div>;
 const customerStats=new Map<string,{count:number;total:number}>();
 for(const o of orders.data??[]){
  if(!o.customer_id)continue;
  const prev=customerStats.get(o.customer_id)??{count:0,total:0};
  prev.count+=1;
  if(!['cancelled','refunded'].includes(o.status))prev.total+=o.total_cents;
  customerStats.set(o.customer_id,prev);
 }
 const rows=(profiles.data??[]) as CustomerRow[];
 return <div className="container admin-workspace">
  <div className="admin-top"><div><div className="section-kicker">CADASTROS • POPÊ BEAUTY</div><h1><Users size={30}/> Clientes cadastrados</h1><p>Consulta administrativa dos cadastros e do histórico de pedidos associados.</p></div><Link href="/admin/pedidos" className="admin-outline"><ShoppingBag size={17}/> Pedidos</Link></div>
  <div className="admin-metric-row">
   <div><Users/><small>Cadastros totais</small><strong>{rows.length}</strong></div>
   <div><ShieldCheck/><small>Clientes</small><strong>{rows.filter(r=>r.role==='customer').length}</strong></div>
   <div><ShoppingBag/><small>Com pedidos vinculados</small><strong>{customerStats.size}</strong></div>
   <div><Users/><small>Equipe / administradores</small><strong>{rows.filter(r=>r.role!=='customer').length}</strong></div>
  </div>
  <p className="ops-info">Esta lista mostra apenas nome de perfil, papel de acesso e pedidos relacionados. Informações de autenticação e documentos não são expostos nesta página.</p>
  <CustomerTable customers={rows.map(r=>({...r,orders:customerStats.get(r.id)?.count??0,total:customerStats.get(r.id)?.total??0}))}/>
 </div>;
}
