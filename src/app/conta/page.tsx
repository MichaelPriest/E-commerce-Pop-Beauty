import Link from 'next/link';
import { redirect } from 'next/navigation';
import { UserRound, LogOut, Heart, ShieldCheck, LockKeyhole, Eye, ShoppingBag, MapPin, Clock3 } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { signOutAction } from '@/app/actions';
import {getAdultStatus} from '@/lib/adult';
import {CancelTestReservation} from '@/components/cancel-test-reservation';
import {formatBRL} from '@/lib/products';
import {dateTimeBR,ORDER_LABELS} from '@/types/operations';
import {mpLivePaymentConfig} from '@/lib/payments/mercado-pago-live';
import {StoreOrderActions} from '@/components/checkout/store-order-actions';
export default async function AccountPage(){
 if(!isSupabaseConfigured()) return <div className="container account-page"><h1>Minha conta</h1><p>O cadastro estará disponível assim que o Supabase for conectado.</p><Link href="/entrar">Voltar</Link></div>;
 const supabase=await createClient();
 const {data:claimData}=await supabase.auth.getClaims();
 const claims=claimData?.claims;
 if(!claims?.sub) redirect('/entrar');
 const {data:profile}=await supabase.from('profiles').select('display_name,role').eq('id',claims.sub).maybeSingle();
 const role=profile?.role;
 const adult=await getAdultStatus();
 const {data:myOrders}=await supabase.from('orders').select('id,status,origin,storefront_order,total_cents,created_at,reservation_expires_at,checkout_delivery_fee_cents,checkout_delivery_snapshot,tracking_code,store_order_cancellations(state)').eq('customer_id',claims.sub).order('created_at',{ascending:false}).limit(20);
 const paymentsAvailable=Boolean(mpLivePaymentConfig()?.linkOrigin);
 return <div className="container account-page"><div className="section-kicker">MINHA POPÊ</div><h1>Olá, {profile?.display_name||claims.email||'beleza'}! 💖</h1>
 <div className="account-card"><UserRound size={44}/><div><strong>Minha conta</strong><p>{claims.email||''}</p><small>Perfil: {role==='admin'?'Administrador':role==='staff'?'Equipe':'Cliente'}</small></div></div>
 <div className="account-card"><MapPin size={30}/><div><strong>Endereços de entrega</strong>
  <p>Cadastre, edite e selecione seu endereço principal.</p>
  <Link href="/conta/enderecos" className="text-link">Gerenciar meus endereços</Link>
 </div></div>
 <div className="account-card"><ShoppingBag/><div><strong>Meus pedidos e reservas</strong>
 {myOrders?.length?myOrders.map(o=>{
  const cancellation=Array.isArray(o.store_order_cancellations)?o.store_order_cancellations[0]:o.store_order_cancellations;
  return <div className="pope-account-order" key={o.id}>
  <p><b>#{o.id.slice(0,8).toUpperCase()}</b> ·
   {o.origin==='store_api'?' Reserva de homologação':o.storefront_order?' Compra online':' Pedido interno'} ·
   {ORDER_LABELS[o.status]??o.status} ·
   {(o.total_cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
  </p>
  {o.origin==='store_api'?<>
   {o.checkout_delivery_snapshot?
    <small>{o.checkout_delivery_snapshot.name} · Frete de teste {formatBRL(o.checkout_delivery_fee_cents)}</small>
    :<small>Reserva de estoque em homologação.</small>}
   {o.reservation_expires_at?<small>Limite da reserva {dateTimeBR(o.reservation_expires_at)}</small>:null}
   {o.status==='pending'?<CancelTestReservation orderId={o.id}/>:null}
  </>:o.storefront_order?<>
   {o.checkout_delivery_snapshot&&<small>{o.checkout_delivery_snapshot.name} · Frete {formatBRL(o.checkout_delivery_fee_cents)}</small>}
   {o.tracking_code&&<small>Rastreio {o.tracking_code}</small>}
   {cancellation?.state==='requested'&&<p role="status">Cancelamento solicitado.</p>}
   {!['cancelled','refunded'].includes(o.status)&&cancellation?.state!=='requested'&&<StoreOrderActions orderId={o.id}
    pay={paymentsAvailable&&o.status==='pending'&&!!o.reservation_expires_at&&Date.parse(o.reservation_expires_at)>Date.now()}
    cancel={true}/>}
  </>:<small>Pedido registrado na loja</small>}
 </div>}):
 <p>Você ainda não tem pedidos vinculados à sua conta.</p>}
 </div></div>
 {adult.enabled?<div className="account-card"><LockKeyhole/><div><strong>Acesso à seção restrita +18</strong><p>{adult.verified?'Sua maioridade está verificada.':'O conteúdo permanece bloqueado até a confirmação da maioridade por procedimento confiável.'}</p><Link href="/adulto" className="text-link">{adult.verified?'Abrir área restrita':'Solicitar ou acompanhar verificação'}</Link></div></div>:null}
 {role==='admin'?<Link className="hero-button" href="/admin"><ShieldCheck size={17}/> Abrir administração</Link>:null}
 {role==='admin'?<div className="account-card"><Eye size={28}/><div><strong>Prévia interna do catálogo +18</strong><p>Disponível como administrador para gerenciar produtos. Não substitui a comprovação independente de maioridade.</p><Link href="/admin/adulto" className="text-link">Abrir prévia administrativa</Link></div></div>:null}
 <form action={signOutAction}><button className="logout-button" type="submit"><LogOut size={18}/> Sair da conta</button></form>
 </div>;
}
