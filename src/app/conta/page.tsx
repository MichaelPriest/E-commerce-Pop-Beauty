import Link from 'next/link';
import {redirect} from 'next/navigation';
import {ArrowRight,ChevronRight,Eye,Heart,LogOut,LockKeyhole,MapPin,Package,ShieldCheck,Truck,UserRound,Headset,Clapperboard,Star} from 'lucide-react';
import {createClient} from '@/lib/supabase/server';
import {isSupabaseConfigured} from '@/lib/supabase/config';
import {getStorefrontCustomer} from '@/lib/storefront-customer';
import {signOutAction} from '@/app/actions';
import {DisplayNameForm} from './display-name-form';
import {getAdultStatus} from '@/lib/adult';
import {CancelTestReservation} from '@/components/cancel-test-reservation';
import {formatBRL} from '@/lib/products';
import {normalizeCatalogPage} from '@/lib/catalog-query-core';
import {dateTimeBR,ORDER_LABELS} from '@/types/operations';
import {mpLivePaymentConfig} from '@/lib/payments/mercado-pago-live';
import {StoreOrderActions} from '@/components/checkout/store-order-actions';

const pageSize=10;
const ordersHref=(page:number)=>(page===1?'/conta':'/conta?pagina='+page)+'#pedidos';

export default async function AccountPage({searchParams}:{searchParams:Promise<{pagina?:string|string[]}>}){
 if(!isSupabaseConfigured())return <div className="container customer-area"><h1>Minha conta</h1>
  <p>O acesso à conta está indisponível no momento.</p><Link className="customer-link-button" href="/">Voltar à loja</Link></div>;
 const customer=await getStorefrontCustomer();
 if(!customer)redirect('/entrar');
 const page=normalizeCatalogPage((await searchParams).pagina);
 const offset=(page-1)*pageSize;
 const db=await createClient();
 const [adult,orders]=await Promise.all([
  getAdultStatus(),
  db.from('orders').select('id,status,origin,storefront_order,total_cents,created_at,reservation_expires_at,checkout_delivery_fee_cents,checkout_delivery_snapshot,tracking_code,store_order_cancellations(state)')
   .eq('customer_id',customer.id).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+pageSize)
 ]);
 const myOrders=orders.data??[];
 const loadFailed=orders.error&&orders.error.code!=='PGRST103';
 const paymentsAvailable=Boolean(mpLivePaymentConfig()?.linkOrigin);
 return <div className="container customer-area account-home">
  <header className="customer-heading">
   <div><h1>Minha conta</h1>
    <p><strong>{customer.name?'Olá, '+customer.name+'!':'Olá!'}</strong>{customer.email&&<span>{customer.email}</span>}</p>
    <DisplayNameForm name={customer.name}/>
   </div>
   <form action={signOutAction}><button className="customer-logout" type="submit"><LogOut size={16}/> Sair da conta</button></form>
  </header>
  <nav className="customer-shortcuts" aria-label="Atalhos da minha conta">
   <Link href="#pedidos"><Package/><span><strong>Meus pedidos</strong><small>Compras e reservas</small></span><ChevronRight/></Link>
   <Link href="/conta/enderecos"><MapPin/><span><strong>Meus endereços</strong><small>Entregas e endereço principal</small></span><ChevronRight/></Link>
   <Link href="/favoritos"><Heart/><span><strong>Meus favoritos</strong><small>Produtos salvos neste navegador</small></span><ChevronRight/></Link>
   <Link href="/conta/atendimento"><Headset/><span><strong>Atendimento</strong><small>Trocas, devoluções e suporte</small></span><ChevronRight/></Link>
  </nav>
  <section id="pedidos" className="customer-orders" aria-labelledby="orders-title">
   <h2 id="orders-title">Meus pedidos e reservas</h2>
   {loadFailed?<div className="customer-empty" role="alert"><p>Não foi possível carregar seus pedidos.</p>
    <form action="/conta#pedidos" method="get">{page>1&&<input type="hidden" name="pagina" value={page}/>}
     <button className="customer-link-button" type="submit">Tentar novamente</button></form></div>:
    myOrders.length===0?<div className="customer-empty"><Package aria-hidden="true"/>
     <h3>{page===1?'Você ainda não tem pedidos':'Nenhum pedido nesta página'}</h3>
     {page===1?<><p>Quando fizer sua primeira compra, você poderá acompanhar o pedido aqui.</p>
      <Link className="customer-link-button" href="/#destaques">Explorar produtos <ArrowRight size={16}/></Link></>:
      <Link className="customer-link-button" href={ordersHref(1)}>Ver pedidos mais recentes</Link>}
    </div>:<ul className="customer-order-list">{myOrders.slice(0,pageSize).map(o=>{
     const test=o.origin==='store_api';
     const cancellation=Array.isArray(o.store_order_cancellations)?o.store_order_cancellations[0]:o.store_order_cancellations;
     return <li key={o.id} className="customer-order">
      <div className="customer-order-heading">
       <div><small>{test?'Reserva de homologação':o.storefront_order?'Compra online':'Pedido interno'}</small>
        <h3><Link href={'/conta/pedidos/'+o.id}>#{o.id.slice(0,8).toUpperCase()}</Link></h3></div>
       <span className="order-status" data-status={o.status}>{test&&o.status==='pending'?'Reserva em aberto':ORDER_LABELS[o.status]??o.status}</span>
      </div>
      <dl className="customer-order-facts">
       <div><dt>Data</dt><dd><time dateTime={o.created_at}>{dateTimeBR(o.created_at)}</time></dd></div>
       <div><dt>Total</dt><dd>{formatBRL(o.total_cents)}</dd></div>
       {(test||o.storefront_order)&&o.checkout_delivery_snapshot&&<div><dt>{test?'Frete de teste':'Entrega'}</dt>
        <dd>{o.checkout_delivery_snapshot.name} · {formatBRL(o.checkout_delivery_fee_cents)}</dd></div>}
      </dl>
      <Link className="customer-order-detail-link" href={'/conta/pedidos/'+o.id}>Ver detalhes e acompanhar pedido <ChevronRight size={16}/></Link>
      {test?<>{o.reservation_expires_at&&<p>Limite da reserva {dateTimeBR(o.reservation_expires_at)}</p>}
       {o.status==='pending'&&<CancelTestReservation orderId={o.id}/>}</>:o.storefront_order?<>
       {o.tracking_code&&<p className="customer-tracking"><Truck size={16}/> Rastreio <strong>{o.tracking_code}</strong></p>}
       {cancellation?.state==='requested'&&<p role="status">Cancelamento solicitado.</p>}
       {!['cancelled','refunded'].includes(o.status)&&cancellation?.state!=='requested'&&<StoreOrderActions orderId={o.id}
        pay={paymentsAvailable&&o.status==='pending'&&!!o.reservation_expires_at&&Date.parse(o.reservation_expires_at)>Date.now()} cancel={true}/>}
      </>:null}
     </li>;
    })}</ul>}
   {!loadFailed&&myOrders.length>0&&(page>1||myOrders.length>pageSize)&&<nav className="customer-pagination" aria-label="Páginas de pedidos">
    {page>1&&<Link href={ordersHref(page-1)}>Mais recentes</Link>}<span>Página {page}</span>
    {myOrders.length>pageSize&&<Link href={ordersHref(page+1)}>Mais antigos</Link>}
   </nav>}
  </section>
  {(adult.enabled||customer.role==='admin'||customer.role==='staff')&&<aside className="customer-access">
   {adult.enabled&&<Link href="/adulto"><LockKeyhole size={17}/>{adult.verified?'Abrir área restrita +18':'Acompanhar verificação de maioridade'}</Link>}
   {(customer.role==='admin'||customer.role==='staff')&&<>
    <Link href="/equipe/feed"><Clapperboard size={17}/> Gerenciar feed Popê</Link>
    <Link href="/equipe/avaliacoes"><Star size={17}/> Moderar avaliações</Link>
   </>}
   {customer.role==='admin'&&<><Link href="/admin"><ShieldCheck size={17}/> Abrir administração</Link>
    <Link href="/admin/adulto"><Eye size={17}/> Prévia administrativa +18</Link></>}
   {customer.role==='staff'&&<span><UserRound size={17}/> Perfil de equipe</span>}
  </aside>}
 </div>;
}
