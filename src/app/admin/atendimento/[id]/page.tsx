import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ArrowLeft,Package} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import type {ServiceRequest} from '@/lib/customer-service';
import type {ServiceConversationMessage} from '@/lib/customer-service-conversation';
import {SupportConversation} from '@/components/support-conversation';

export const dynamic='force-dynamic';
export const metadata={title:'Conversa de suporte | Popê Beauty'};
type Props={params:Promise<{id:string}>};
const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export default async function AdminSupportConversationPage({params}:Props){
 const sb=await requireAdmin();
 const {id}=await params;
 if(!uuid.test(id))notFound();
 const {data:request,error}=await sb.from('customer_service_requests')
  .select('id,user_id,order_id,category,subject,description,status,admin_note,reviewed_by,created_at,updated_at')
  .eq('id',id).maybeSingle();
 if(error||!request)notFound();
 const {data:rows,error:messagesError}=await sb.from('customer_service_messages')
  .select('id,request_id,author_id,author_role,body,created_at')
  .eq('request_id',id).order('created_at',{ascending:false})
  .order('id',{ascending:false}).limit(101);
 return <div className="container admin-workspace pope-admin-service">
  <div className="admin-top">
   <div><div className="section-kicker">POPÊ BEAUTY • ATENDIMENTO</div>
    <h1>Conversa com o cliente</h1>
    <p>Responder registra a mensagem e atualiza o chamado; não efetua reembolsos.</p>
   </div>
   <Link className="admin-outline" href="/admin/atendimento">
    <ArrowLeft size={16}/> Voltar à fila
   </Link>
  </div>
  {request.order_id?<p className="pope-support-linked-order">
   <Package size={15}/><Link href={'/admin/pedidos/'+request.order_id}>
    Ver pedido #{request.order_id.slice(0,8).toUpperCase()}</Link>
  </p>:null}
  {messagesError?<p className="form-error" role="alert">
   Não foi possível carregar as mensagens do atendimento.</p>:
   <SupportConversation request={request as ServiceRequest}
    messages={((rows??[]).slice(0,100).reverse()) as ServiceConversationMessage[]}
    hasMore={(rows??[]).length>100} staff/>}
 </div>;
}
