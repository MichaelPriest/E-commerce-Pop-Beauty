import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {ArrowLeft,Package} from 'lucide-react';
import {createClient} from '@/lib/supabase/server';
import {getStorefrontCustomer} from '@/lib/storefront-customer';
import {isSupabaseConfigured} from '@/lib/supabase/config';
import type {ServiceRequest} from '@/lib/customer-service';
import type {ServiceConversationMessage} from '@/lib/customer-service-conversation';
import {SupportConversation} from '@/components/support-conversation';

export const dynamic='force-dynamic';
export const metadata={title:'Conversa do atendimento | Popê Beauty',robots:{index:false,follow:false}};
type Props={params:Promise<{id:string}>};
const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export default async function CustomerSupportConversationPage({params}:Props){
 if(!isSupabaseConfigured())redirect('/conta');
 const customer=await getStorefrontCustomer();
 if(!customer)redirect('/entrar');
 const {id}=await params;
 if(!uuid.test(id))notFound();
 const sb=await createClient();
 const {data:request,error}=await sb.from('customer_service_requests')
  .select('id,user_id,order_id,category,subject,description,status,admin_note,reviewed_by,created_at,updated_at')
  .eq('id',id).eq('user_id',customer.id).maybeSingle();
 if(error||!request)notFound();
 const {data:rows,error:messagesError}=await sb.from('customer_service_messages')
  .select('id,request_id,author_id,author_role,body,created_at')
  .eq('request_id',id).order('created_at',{ascending:false})
  .order('id',{ascending:false}).limit(101);
 return <div className="container customer-area pope-support">
  <Link className="customer-back" href="/conta/atendimento">
   <ArrowLeft size={16}/> Voltar às solicitações
  </Link>
  {request.order_id?<p className="pope-support-linked-order">
   <Package size={15}/><Link href={'/conta/pedidos/'+request.order_id}>
    Ver pedido #{request.order_id.slice(0,8).toUpperCase()}</Link>
  </p>:null}
  {messagesError?<div role="alert" className="form-error">
   Não foi possível carregar a conversa. Tente novamente.</div>:
   <SupportConversation request={request as ServiceRequest}
    messages={((rows??[]).slice(0,100).reverse()) as ServiceConversationMessage[]}
    hasMore={(rows??[]).length>100} staff={false}/>}
 </div>;
}
