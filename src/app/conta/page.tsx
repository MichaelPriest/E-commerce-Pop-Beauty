import Link from 'next/link';
import { redirect } from 'next/navigation';
import { UserRound, LogOut, Heart, ShieldCheck, LockKeyhole, Eye, ShoppingBag, MapPin, Clock3 } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { signOutAction } from '@/app/actions';
import {getAdultStatus} from '@/lib/adult';
import {CancelTestReservation} from '@/components/cancel-test-reservation';
export default async function AccountPage(){
 if(!isSupabaseConfigured()) return <div className="container account-page"><h1>Minha conta</h1><p>O cadastro estará disponível assim que o Supabase for conectado.</p><Link href="/entrar">Voltar</Link></div>;
 const supabase=await createClient();
 const {data:claimData}=await supabase.auth.getClaims();
 const claims=claimData?.claims;
 if(!claims?.sub) redirect('/entrar');
 const {data:profile}=await supabase.from('profiles').select('display_name,role').eq('id',claims.sub).maybeSingle();
 const role=profile?.role;
 const adult=await getAdultStatus();
 const {data:myOrders}=await supabase.from('orders').select('id,status,origin,total_cents,created_at,reservation_expires_at,order_items(title_snapshot,quantity,unit_price_cents)').eq('customer_id',claims.sub).order('created_at',{ascending:false}).limit(20);
 return <div className="container account-page"><div className="section-kicker">MINHA POPÊ</div><h1>Olá, {profile?.display_name||claims.email||'beleza'}! 💖</h1>
 <div className="account-card"><UserRound size={44}/><div><strong>Minha conta</strong><p>{claims.email||''}</p><small>Perfil: {role==='admin'?'Administrador':role==='staff'?'Equipe':'Cliente'}</small></div></div>
 <div className="account-card"><MapPin size={30}/><div><strong>Endereços de entrega</strong>
  <p>Cadastre, edite e selecione seu endereço principal.</p>
  <Link href="/conta/enderecos" className="text-link">Gerenciar meus endereços</Link>
 </div></div>
 <div className="account-card"><ShoppingBag/><div><strong>Meus pedidos e reservas</strong>
 {myOrders?.length?myOrders.map(o=><div className="pope-account-order" key={o.id}>
  <p><b>#{o.id.slice(0,8).toUpperCase()}</b> ·
   {o.origin==='store_api'?' Reserva de homologação':' Pedido interno'} ·
   {o.status==='pending'?'Pendente':o.status==='cancelled'?'Encerrado':o.status} ·
   {(o.total_cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
  </p>
  {o.origin==='store_api'?<>
   <small>Teste sem cobrança, frete ou venda confirmada.</small>
   {o.reservation_expires_at?<small>Limite da reserva: {new Date(o.reservation_expires_at).toLocaleString('pt-BR')}</small>:null}
   {o.status==='pending'?<CancelTestReservation orderId={o.id}/>:null}
  </>:<small>Pedido registrado na loja</small>}
 </div>):
 <p>Você ainda não tem pedidos vinculados à sua conta. Checkout online em preparação.</p>}
 </div></div>
 {adult.enabled?<div className="account-card"><LockKeyhole/><div><strong>Acesso à seção restrita +18</strong><p>{adult.verified?'Sua maioridade está verificada.':'O conteúdo permanece bloqueado até a confirmação da maioridade por procedimento confiável.'}</p><Link href="/adulto" className="text-link">{adult.verified?'Abrir área restrita':'Solicitar ou acompanhar verificação'}</Link></div></div>:null}
 {role==='admin'?<Link className="hero-button" href="/admin"><ShieldCheck size={17}/> Abrir administração</Link>:null}
 {role==='admin'?<div className="account-card"><Eye size={28}/><div><strong>Prévia interna do catálogo +18</strong><p>Disponível como administrador para gerenciar produtos. Não substitui a comprovação independente de maioridade.</p><Link href="/admin/adulto" className="text-link">Abrir prévia administrativa</Link></div></div>:null}
 <form action={signOutAction}><button className="logout-button" type="submit"><LogOut size={18}/> Sair da conta</button></form>
 </div>;
}
