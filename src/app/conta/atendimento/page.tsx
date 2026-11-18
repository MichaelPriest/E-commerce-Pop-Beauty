import Link from 'next/link';
import {redirect} from 'next/navigation';
import {ArrowLeft,Headset,Package,MessageCircle,Clock3} from 'lucide-react';
import {createClient} from '@/lib/supabase/server';
import {getStorefrontCustomer} from '@/lib/storefront-customer';
import {isSupabaseConfigured} from '@/lib/supabase/config';
import {dateTimeBR} from '@/types/operations';
import {
 SERVICE_CATEGORIES,serviceStatusLabel,type ServiceRequest
} from '@/lib/customer-service';
import {CustomerServiceForm} from './service-form';

export const dynamic='force-dynamic';
export const metadata={title:'Atendimento e pós-venda | Popê Beauty',robots:{index:false,follow:false}};

export default async function CustomerSupportPage({searchParams}:{
 searchParams:Promise<{pedido?:string}>;
}){
 if(!isSupabaseConfigured())return <div className="container customer-area">
  <h1>Atendimento</h1><p>O atendimento está temporariamente indisponível.</p>
 </div>;
 const customer=await getStorefrontCustomer();
 if(!customer)redirect('/entrar');
 const sb=await createClient();
 const [requests,orders]=await Promise.all([
  sb.from('customer_service_requests')
   .select('id,user_id,order_id,category,subject,description,status,admin_note,reviewed_by,created_at,updated_at')
   .eq('user_id',customer.id).order('created_at',{ascending:false}).limit(30),
  sb.from('orders').select('id,created_at,status')
   .eq('customer_id',customer.id).neq('origin','store_api')
   .order('created_at',{ascending:false}).limit(30)
 ]);
 const unavailable=!!requests.error;
 const requested=(await searchParams).pedido;
 const defaultOrderId=(orders.data??[]).some(order=>order.id===requested)?
  requested??'':'';
 return <div className="container customer-area pope-support">
  <Link className="customer-back" href="/conta"><ArrowLeft size={16}/> Voltar à minha conta</Link>
  <header className="customer-heading">
   <div><div className="section-kicker">POPÊ BEAUTY • RELACIONAMENTO</div>
    <h1>Atendimento e pós-venda</h1>
    <p>Solicite orientações sobre pedidos, troca ou devolução e acompanhe a resposta.</p>
   </div><Headset size={34} aria-hidden="true"/>
  </header>
  {unavailable?<section className="customer-empty" role="alert">
   <h2>Atendimento temporariamente indisponível</h2>
   <p>Não foi possível carregar suas solicitações. Tente novamente mais tarde.</p>
   <Link className="customer-link-button" href="/conta">Minha conta</Link>
  </section>:<>
   <CustomerServiceForm userId={customer.id} orders={orders.data??[]}
    defaultOrderId={defaultOrderId}/>
   <section className="pope-support-history" aria-labelledby="support-history-heading">
    <h2 id="support-history-heading"><MessageCircle size={22}/> Minhas solicitações</h2>
    {(requests.data??[]).length===0?<div className="customer-empty">
     <Headset size={28}/><h3>Nenhuma solicitação registrada</h3>
     <p>Quando você enviar uma solicitação, poderá acompanhar o andamento aqui.</p>
    </div>:<ul className="pope-support-list">
     {((requests.data??[]) as ServiceRequest[]).map(item=><li key={item.id} className="pope-support-ticket">
      <div className="pope-support-ticket-top">
       <div><small>{SERVICE_CATEGORIES[item.category]} · #{item.id.slice(0,8).toUpperCase()}</small>
        <h3>{item.subject}</h3>
        <small><Clock3 size={13}/> {dateTimeBR(item.created_at)}</small></div>
       <span className="order-status" data-status={item.status}>
        {serviceStatusLabel(item.status)}</span>
      </div>
      {item.order_id?<p className="pope-support-linked-order"><Package size={15}/>
       <Link href={'/conta/pedidos/'+item.order_id}>Pedido #{item.order_id.slice(0,8).toUpperCase()}</Link>
      </p>:null}
      <details className="pope-support-message"><summary>Ver descrição enviada</summary>
       <p>{item.description}</p></details>
      {item.admin_note?<div className="pope-support-reply">
       <strong>Resposta da Popê Beauty</strong><p>{item.admin_note}</p>
      </div>:<small>Aguardando uma atualização da equipe.</small>}
     </li>)}
    </ul>}
   </section>
  </>}
 </div>;
}
