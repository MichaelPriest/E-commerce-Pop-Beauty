import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Boxes, LayoutDashboard, PackageOpen, ShoppingBasket, Truck, Users, Settings, ShieldAlert, ArrowLeft, RefreshCw, Eye, CreditCard, Store } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { formatBRL } from '@/lib/catalog';
export const dynamic='force-dynamic';
export default async function AdminPage() {
 if(!isSupabaseConfigured())return <div className="container account-page"><h1>Painel Popê Beauty</h1><p className="demo-alert">A administração estará disponível depois da criação do projeto Supabase e aplicação do esquema SQL.</p><Link href="/">Voltar à vitrine</Link></div>;
 const supabase=await createClient();
 const {data:claimData}=await supabase.auth.getClaims();
 const claims=claimData?.claims;
 if(!claims?.sub)redirect('/entrar');
 const {data:profile}=await supabase.from('profiles').select('role,display_name').eq('id',claims.sub).maybeSingle();
 if(!profile||!['admin','staff'].includes(profile.role))return <div className="container account-page"><ShieldAlert size={42}/><h1>Acesso restrito</h1><p>Esta área é exclusiva da equipe autorizada.</p><Link href="/conta">Voltar à minha conta</Link></div>;
 const [products,orders,stock]=await Promise.all([
   supabase.from('products').select('id,name,price_cents,active',{count:'exact'}).order('created_at',{ascending:false}).limit(8),
   supabase.from('orders').select('id,status,channel,total_cents',{count:'exact'}).order('created_at',{ascending:false}).limit(8),
   supabase.from('inventory').select('variant_id,on_hand,reserved',{count:'exact'}).limit(8)
 ]);
 return <div className="dashboard container"><div className="admin-top"><div><div className="section-kicker">CENTRAL DE GESTÃO</div><h1>Olá, equipe Popê! 👋</h1><p>Gerencie sua operação de beleza em um só lugar.</p></div><Link href="/" className="outline-link"><ArrowLeft size={16}/> Ver loja</Link></div>
 <div className="admin-nav"><Link href="/admin"><LayoutDashboard/> Visão geral</Link><Link href="/admin/pedidos"><ShoppingBasket/> Pedidos</Link><Link href="/admin/produtos"><PackageOpen/> Produtos</Link><Link href="/admin/estoque"><Boxes/> Estoque</Link><Link href="/admin/logistica"><Truck/> Logística</Link><Link href="/admin/clientes"><Users/> Clientes</Link>
 <Link href="/admin/marketplaces"><Store/> Marketplaces</Link><Link href="/admin/financeiro"><CreditCard/> Financeiro</Link><Link href="/admin/configuracoes"><Settings/> Configurações</Link><Link href="/admin/adulto"><Eye/> Prévia +18</Link></div>
 <div className="stats-grid"><div><ShoppingBasket/><small>Pedidos registrados</small><strong>{orders.count??0}</strong></div><div><PackageOpen/><small>Produtos cadastrados</small><strong>{products.count??0}</strong></div><div><Boxes/><small>SKUs cadastrados</small><strong>{stock.count??0}</strong></div><div><RefreshCw/><small>Marketplaces</small><strong>Não conectados</strong></div></div>
 <div className="admin-panels"><section className="admin-panel"><h2>Produtos recentes</h2>{products.error?<p>Não foi possível carregar os produtos. Confirme as tabelas e permissões.</p>:products.data?.length?<div className="admin-table"><div className="admin-table-row heading"><span>Produto</span><span>Preço</span><span>Status</span></div>{products.data.map(p=><div className="admin-table-row" key={p.id}><span>{p.name}</span><span>{formatBRL(p.price_cents)}</span><span className={p.active?'active-text':'muted'}>{p.active?'Ativo':'Rascunho'}</span></div>)}</div>:<p>Sem produtos cadastrados.</p>}</section>
 <section className="admin-panel"><h2>Pedidos recentes</h2>{orders.error?<p>Não foi possível consultar os pedidos.</p>:orders.data?.length?<div className="admin-table">{orders.data.map(o=><div className="admin-table-row" key={o.id}><span>{o.channel}</span><span>{formatBRL(o.total_cents)}</span><span>{o.status}</span></div>)}</div>:<p>Nenhum pedido registrado.</p>}<div className="marketplaces"><p>🛍️ Loja própria <b>Preparação</b></p><p>🟠 Shopee <b>Aguardando credenciais</b></p><p>🟡 Mercado Livre <b>Aguardando credenciais</b></p></div></section></div>
 <p className="demo-alert">Pedidos manuais, cadastro, expedição e controles financeiros administrativos estão disponíveis. Checkout público, integrações automáticas, etiquetas e gateways ainda não estão habilitados.</p>
 </div>;
}
