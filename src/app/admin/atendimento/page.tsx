import Link from 'next/link';
import {ArrowLeft,Headset} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import type {ServiceRequest} from '@/lib/customer-service';
import {AdminServiceManager} from './service-manager';

export const dynamic='force-dynamic';
export const metadata={title:'Central de atendimento | Popê Beauty'};

export default async function AdminServicePage(){
 const sb=await requireAdmin();
 const {data,error}=await sb.from('customer_service_requests')
  .select('id,user_id,order_id,category,subject,description,status,admin_note,reviewed_by,created_at,updated_at')
  .order('created_at',{ascending:false}).limit(200);
 if(error)return <div className="container admin-workspace">
  <h1>Atendimento e pós-venda</h1>
  <p className="form-error" role="alert">
   Não foi possível abrir a fila. Verifique a migração customer_service_requests_v1.sql.
  </p><Link href="/admin" className="admin-outline">Voltar ao painel</Link>
 </div>;
 const requests=(data??[]) as ServiceRequest[];
 const userIds=[...new Set(requests.map(item=>item.user_id))];
 const profiles=userIds.length?await sb.from('profiles')
  .select('id,display_name').in('id',userIds).limit(200):null;
 const names=Object.fromEntries((profiles?.data??[]).map(x=>[x.id,x.display_name]));
 return <div className="container admin-workspace pope-admin-service">
  <div className="admin-top">
   <div><div className="section-kicker">POPÊ BEAUTY • RELACIONAMENTO</div>
    <h1><Headset size={27}/> Central de atendimento e pós-venda</h1>
    <p>Triagem e resposta das solicitações de clientes. Nenhuma ação executa estornos, trocas ou coleta automaticamente.</p>
   </div>
   <Link href="/admin" className="admin-outline"><ArrowLeft size={16}/> Dashboard</Link>
  </div>
  <AdminServiceManager requests={requests} customerNames={names}/>
 </div>;
}
