import Link from 'next/link';
import {Activity,Boxes,ArrowUpRight,ShoppingBag,Truck,Users,PackagePlus,
 PackageSearch,Store,MailCheck,ShieldCheck,ArrowLeft,AlertCircle,Clock,UserCog,BarChart3,WalletCards,Timer,CreditCard,ClipboardCheck,Tags} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {formatBRL} from '@/lib/products';
import {catalogIssues,brazilTodayISO,type QualityProduct} from '@/lib/catalog-quality';

export const dynamic='force-dynamic';
export default async function AdminPage(){
 const supabase=await requireAdmin();
 const {data:auth}=await supabase.auth.getClaims();
 const userId=auth?.claims?.sub??'';
 const since=new Date(Date.now()-3*60*1000).toISOString();
 const [profile,products,orders,stock,activity,notifications,catalogQuality]=await Promise.all([
  supabase.from('profiles').select('display_name').eq('id',userId).maybeSingle(),
  supabase.from('products').select('id,name,price_cents,active',{count:'exact'})
   .order('created_at',{ascending:false}).limit(6),
  supabase.from('orders').select('id,status,channel,total_cents,created_at',{count:'exact'})
   .neq('origin','store_api').order('created_at',{ascending:false}).limit(6),
  supabase.from('inventory').select('variant_id',{count:'exact',head:true}),
  supabase.from('user_session_presence').select('user_id')
   .is('signed_out_at',null).gte('last_seen_at',since).limit(500),
  supabase.from('order_notifications').select('id',{count:'exact',head:true})
   .in('status',['pending','failed']),
  supabase.from('products')
   .select('id,name,description,image_url,price_cents,variants(sku,active,inventory(on_hand,reserved,safety_stock),inventory_lots(on_hand,expires_at))')
   .eq('active',true).eq('is_adult',false).limit(250)
 ]);
 const firstName=profile.data?.display_name?.trim().split(/\s+/)[0]||'equipe';
 const onlineCount=new Set((activity.data??[]).map(x=>x.user_id)).size;
 const today=brazilTodayISO();
 const qualityRows=(catalogQuality.data??[]) as unknown as (QualityProduct&{id:string;name:string})[];
 const issues=qualityRows.map(p=>({id:p.id,name:p.name,problems:catalogIssues(p,today)}));
 const withIssue=(problem:'photo'|'description'|'stock')=>
  issues.filter(p=>p.problems.includes(problem)).length;
 const photosMissing=withIssue('photo');
 const detailsMissing=withIssue('description');
 const noStock=withIssue('stock');
 const pendingOrders=orders.data?.filter(x=>x.status==='pending').length??0;
 const tasks=[
  {label:'Produtos sem fotografia',count:photosMissing,
   detail:'Adicione fotos reais para apresentar os itens.',href:'/admin/produtos?filtro=pendencias'},
  {label:'Produtos sem estoque disponível',count:noStock,
   detail:'Revise lotes, reservas e reposição.',href:'/admin/estoque'},
  {label:'Produtos com descrição curta',count:detailsMissing,
   detail:'Melhore a apresentação e os detalhes de uso.',href:'/admin/produtos?filtro=pendencias'},
  {label:'Pedidos aguardando confirmação',count:pendingOrders,
   detail:'Confira os pedidos administrativos pendentes.',href:'/admin/pedidos'},
  {label:'Notificações aguardando ação',count:notifications.count??0,
   detail:'Verifique os e-mails pendentes ou com falha.',href:'/admin/notificacoes'}
 ];
 const shortcuts=[
  {href:'/admin/produtos',label:'Cadastrar produto',caption:'Novo item do catálogo',icon:PackagePlus},
  {href:'/admin/pedidos',label:'Novo pedido',caption:'Criar pedido interno',icon:ShoppingBag},
  {href:'/admin/estoque',label:'Ajustar estoque',caption:'Lotes e movimentações',icon:Boxes},
  {href:'/admin/notificacoes',label:'E-mails de pedidos',caption:'Fila e reenvios',icon:MailCheck},
  {href:'/admin/promocoes',label:'Cupons e promoções',caption:'Campanhas internas e simulação',icon:Tags}
 ];
 return <div className="dashboard container pope-admin-dashboard">
  <div className="admin-top">
   <div><div className="section-kicker">CENTRAL DE GESTÃO • POPÊ BEAUTY</div>
    <h1>Olá, {firstName}! <span aria-hidden="true">👋</span></h1>
    <p>Este é o resumo operacional da sua loja. Acesse os módulos pelo menu lateral.</p>
   </div>
   <Link href="/" className="admin-outline"><ArrowLeft size={16}/> Ver loja</Link>
  </div>
  <section className="admin-panel pope-admin-action-center" aria-labelledby="pope-tasks-heading">
   <div className="pope-admin-panel-heading">
    <div><h2 id="pope-tasks-heading">O que precisa de atenção agora</h2>
     <p className="admin-help">Pendências calculadas a partir dos dados atuais da loja.</p>
    </div>
    <Link href="/admin/prontidao">Prontidão para produção <ArrowUpRight size={15}/></Link>
   </div>
   {catalogQuality.error?<p className="form-error">Não foi possível conferir a qualidade do catálogo.
    Revise o cadastro de produtos antes da abertura comercial.</p>:null}
   <div className="pope-admin-tasks">
    {tasks.map(item=><Link href={item.href} key={item.label}
     className={'pope-admin-task'+(item.count>0?' has-issues':'')}>
     <strong>{item.count}</strong>
     <span><b>{item.label}</b><small>{item.detail}</small></span>
     <ArrowUpRight size={17}/>
    </Link>)}
   </div>
   {qualityRows.length===250?<p className="admin-help">A conferência de catálogo cobre
    somente os 250 produtos públicos mais recentes. Use filtros para revisar todos.</p>:null}
  </section>
  <section aria-label="Atalhos rápidos" className="pope-admin-dashboard-shortcuts">
   {shortcuts.map(item=>{const Icon=item.icon;return <Link href={item.href} key={item.href}>
    <span className="pope-admin-dash-icon"><Icon size={21}/></span>
    <span className="pope-admin-dash-copy"><strong>{item.label}</strong><small>{item.caption}</small></span>
    <ArrowUpRight size={18} className="pope-admin-dash-arrow"/>
   </Link>})}
  </section>
  <div className="stats-grid pope-admin-dashboard-stats">
   <Link href="/admin/pedidos"><ShoppingBag/><small>Pedidos registrados</small><strong>{orders.count??0}</strong><span>Ver pedidos <ArrowUpRight size={15}/></span></Link>
   <Link href="/admin/produtos"><PackageSearch/><small>Produtos cadastrados</small><strong>{products.count??0}</strong><span>Ver catálogo <ArrowUpRight size={15}/></span></Link>
   <Link href="/admin/estoque"><Boxes/><small>SKUs no estoque</small><strong>{stock.count??0}</strong><span>Gerenciar <ArrowUpRight size={15}/></span></Link>
   <Link href="/admin/usuarios-online"><Activity/><small>Usuários ativos recentemente</small><strong>{onlineCount}</strong><span>Ver atividade <ArrowUpRight size={15}/></span></Link>
  </div>
  <div className="admin-panels pope-admin-dashboard-panels">
   <section className="admin-panel">
    <div className="pope-admin-panel-heading"><h2>Produtos recentes</h2>
     <Link href="/admin/produtos">Todos os produtos <ArrowUpRight size={15}/></Link></div>
    {products.error?<p>Não foi possível consultar produtos.</p>:
     products.data?.length?<div className="admin-table">
      <div className="admin-table-row heading"><span>Produto</span><span>Preço</span><span>Status</span></div>
      {products.data.map(p=><div className="admin-table-row" key={p.id}>
       <span>{p.name}</span><span>{formatBRL(p.price_cents)}</span>
       <span className={p.active?'active-text':'muted'}>{p.active?'Ativo':'Rascunho'}</span>
      </div>)}</div>:
      <div className="pope-admin-panel-empty"><PackagePlus size={24}/><p>Nenhum produto cadastrado.</p><Link href="/admin/produtos">Adicionar produto</Link></div>}
   </section>
   <section className="admin-panel">
    <div className="pope-admin-panel-heading"><h2>Pedidos recentes</h2>
     <Link href="/admin/pedidos">Todos os pedidos <ArrowUpRight size={15}/></Link></div>
    {orders.error?<p>Não foi possível consultar pedidos.</p>:
     orders.data?.length?<div className="admin-table">
      <div className="admin-table-row heading"><span>Origem</span><span>Total</span><span>Status</span></div>
      {orders.data.map(o=><div className="admin-table-row" key={o.id}>
       <span><Link href={'/admin/pedidos/'+o.id}
        className="pope-oc-order-link">#{o.id.slice(0,8).toUpperCase()}</Link>
        <small>{o.channel==='store'?'Loja':o.channel}</small></span>
       <span>{formatBRL(o.total_cents)}</span>
       <span>{o.status}</span>
      </div>)}</div>:
      <div className="pope-admin-panel-empty"><ShoppingBag size={24}/><p>Nenhum pedido registrado.</p><Link href="/admin/pedidos">Abrir pedidos</Link></div>}
    <div className="pope-admin-ops-shortcuts">
     <Link href="/admin/logistica"><Truck size={16}/> Logística</Link>
     <Link href="/admin/marketplaces"><Store size={16}/> Marketplaces</Link>
     <Link href="/admin/clientes"><Users size={16}/> Clientes</Link>
     <Link href="/admin/relatorios"><BarChart3 size={16}/> Relatórios</Link><Link href="/admin/gateways"><WalletCards size={16}/> Gateways</Link>
     <Link href="/admin/pagamentos"><CreditCard size={16}/> Pagamentos sandbox</Link>
     <Link href="/admin/reservas"><Timer size={16}/> Reservas teste</Link>
     <Link href="/admin/prontidao"><ClipboardCheck size={16}/> Prontidão</Link>
     <Link href="/admin/usuarios"><UserCog size={16}/> Permissões</Link>
    </div>
   </section>
  </div>
  <div className="pope-admin-dash-notice">
   <ShieldCheck size={19}/><span><strong>Área de gestão protegida.</strong> O checkout público e a sincronização automática de marketplaces ainda não estão habilitados. {notifications.count?String(notifications.count)+' notificações de pedidos aguardam processamento.':'Notificações de pedidos: sem pendências conhecidas.'}</span>
   <Link href="/admin/notificacoes"><MailCheck size={16}/> Notificações</Link>
  </div>
 </div>;
}
