'use client';
import {useEffect,useMemo,useState,type ReactNode,type ComponentType} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {
 LayoutDashboard,ShoppingBag,MailCheck,PackageSearch,Boxes,Truck,Users,
 CreditCard,Store,Eye,Settings,ShieldCheck,LogOut,UserRound,PanelLeftClose,
 PanelLeftOpen,Menu,X,ChevronDown,ChevronRight,Search,ExternalLink,
 CircleHelp,Activity,Plus,PackagePlus,ArrowLeft,UserCog,History,BarChart3,WalletCards,Timer,ClipboardCheck,FileText,ClipboardList,FolderTree,FileSpreadsheet,ClipboardList as ReplenishmentIcon,Building2,ScanBarcode,Tags,Headset
} from 'lucide-react';
import {signOutAction} from '@/app/actions';
import {
 activeAdminRoute,activeAdminSection,searchAdminNavigation
} from '@/lib/admin-navigation-core';

type IconType=ComponentType<{size?:number;strokeWidth?:number;className?:string}>;
type NavItem={href:string;label:string;icon:IconType;count?:number};
type NavGroup={id:string;title:string;icon:IconType;items:NavItem[]};
type Props={
 children:ReactNode;
 currentUser:{name:string;email:string;role:string};
 onlineCount:number;pendingOrders:number;pendingNotifications:number;pendingSupport:number;
};

export function AdminShell({children,currentUser,onlineCount,pendingOrders,pendingNotifications,pendingSupport}:Props){
 const pathname=usePathname();
 const [collapsed,setCollapsed]=useState(false),[mobileOpen,setMobileOpen]=useState(false);
 const [quickOpen,setQuickOpen]=useState(false),[profileOpen,setProfileOpen]=useState(false);
 const [quickFilter,setQuickFilter]=useState('');
 useEffect(()=>{
  try{setCollapsed(window.localStorage.getItem('pope-admin-collapsed')==='1');}catch{}
 },[]);
 useEffect(()=>{setMobileOpen(false);setQuickOpen(false);setProfileOpen(false);},[pathname]);
 useEffect(()=>{
  const onKey=(event:KeyboardEvent)=>{
   if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
    event.preventDefault();setQuickOpen(true);setProfileOpen(false);
   }else if(event.key==='Escape'){
    setMobileOpen(false);setQuickOpen(false);setProfileOpen(false);
   }
  };
  window.addEventListener('keydown',onKey);
  return ()=>window.removeEventListener('keydown',onKey);
 },[]);
 const primaryItems:NavItem[]=useMemo(()=>[
  {href:'/admin',label:'Visão geral',icon:LayoutDashboard},
  {href:'/admin/pedidos',label:'Pedidos',icon:ShoppingBag,count:pendingOrders},
  {href:'/admin/notificacoes',label:'Notificações',icon:MailCheck,count:pendingNotifications}
 ],[pendingOrders,pendingNotifications]);
 // Organização por processo de trabalho. Nenhuma rota foi removida.
 const groups:NavGroup[]=useMemo(()=>[
  {id:'vendas',title:'Vendas e clientes',icon:ShoppingBag,items:[
   {href:'/admin/clientes',label:'Clientes',icon:Users},
   {href:'/admin/atendimento',label:'Atendimento e pós-venda',icon:Headset,count:pendingSupport},
   {href:'/admin/marketplaces',label:'Marketplaces',icon:Store},
   {href:'/admin/reservas',label:'Reservas de teste',icon:Timer}
  ]},
  {id:'catalogo',title:'Catálogo e campanhas',icon:PackageSearch,items:[
   {href:'/admin/produtos',label:'Produtos',icon:PackageSearch},
   {href:'/admin/produtos/importar',label:'Importar produtos CSV',icon:FileSpreadsheet},
   {href:'/admin/categorias',label:'Categorias e subcategorias',icon:FolderTree},
   {href:'/admin/promocoes',label:'Cupons e promoções',icon:Tags},
   {href:'/admin/adulto',label:'Prévia reservada +18',icon:Eye}
  ]},
  {id:'estoque',title:'Estoque e compras',icon:Boxes,items:[
   {href:'/admin/estoque',label:'Estoque e lotes',icon:Boxes},
   {href:'/admin/estoque/reposicao',label:'Reposição de estoque',icon:ReplenishmentIcon},
   {href:'/admin/estoque/compras',label:'Pedidos de compra',icon:ClipboardList},
   {href:'/admin/estoque/recebimento',label:'Recebimento de mercadorias',icon:ScanBarcode},
   {href:'/admin/fornecedores',label:'Fornecedores',icon:Building2}
  ]},
  {id:'logistica',title:'Logística e fiscal',icon:Truck,items:[
   {href:'/admin/logistica',label:'Logística',icon:Truck},
   {href:'/admin/remessas',label:'Central de remessas',icon:ClipboardList},
   {href:'/admin/frete',label:'Frete e embalagem',icon:PackagePlus},
   {href:'/admin/fiscal',label:'Fiscal e documentos',icon:FileText}
  ]},
  {id:'financeiro',title:'Financeiro e relatórios',icon:WalletCards,items:[
   {href:'/admin/financeiro',label:'Financeiro',icon:CreditCard},
   {href:'/admin/gateways',label:'Gateways de pagamento',icon:WalletCards},
   {href:'/admin/pagamentos',label:'Pagamentos (sandbox)',icon:CreditCard},
   {href:'/admin/relatorios',label:'Relatórios',icon:BarChart3}
  ]},
  {id:'sistema',title:'Equipe e sistema',icon:Settings,items:[
   {href:'/admin/usuarios-online',label:'Usuários ativos',icon:Activity,count:onlineCount},
   {href:'/admin/usuarios',label:'Usuários e permissões',icon:UserCog},
   {href:'/admin/auditoria',label:'Auditoria',icon:History},
   {href:'/admin/prontidao',label:'Prontidão para produção',icon:ClipboardCheck},
   {href:'/admin/configuracoes',label:'Configurações',icon:Settings}
  ]}
 ],[onlineCount,pendingSupport]);
 const allItems=useMemo(()=>[...primaryItems,...groups.flatMap(group=>group.items)],
  [primaryItems,groups]);
 // Prioriza a rota mais específica para não marcar "Produtos" junto com "Importar".
 const currentHref=activeAdminRoute(pathname,allItems);
 const current=allItems.find(item=>item.href===currentHref)??primaryItems[0];
 const activeGroup=activeAdminSection(pathname,groups);
 const [openedGroup,setOpenedGroup]=useState(activeGroup||'vendas');
 useEffect(()=>{setOpenedGroup(activeGroup||'vendas');},[activeGroup,pathname]);
 const shortcuts:NavItem[]=[
  {href:'/admin/pedidos',label:'Novo pedido',icon:ShoppingBag},
  {href:'/admin/produtos',label:'Cadastrar produto',icon:PackagePlus},
  {href:'/admin/produtos/importar',label:'Importar planilha CSV',icon:FileSpreadsheet},
  {href:'/admin/estoque/reposicao',label:'Planejar reposição',icon:ReplenishmentIcon},
  {href:'/admin/estoque/compras',label:'Fazer pedido de compra',icon:ClipboardList},
  {href:'/admin/estoque/recebimento',label:'Conferir mercadorias',icon:ScanBarcode},
  {href:'/admin/fornecedores',label:'Cadastrar fornecedor',icon:Building2},
  {href:'/admin/categorias',label:'Cadastrar categorias',icon:FolderTree},
  {href:'/admin/promocoes',label:'Gerenciar cupons e campanhas',icon:Tags},
  {href:'/admin/estoque',label:'Ajustar estoque',icon:Boxes},
  {href:'/admin/notificacoes',label:'Consultar e-mails',icon:MailCheck},
  {href:'/admin/atendimento',label:'Atender solicitações de clientes',icon:Headset},
  {href:'/admin/usuarios-online',label:'Usuários ativos',icon:Activity},
  {href:'/admin/usuarios',label:'Permissões',icon:UserCog},
  {href:'/admin/relatorios',label:'Relatórios',icon:BarChart3},
  {href:'/admin/gateways',label:'Comparar gateways',icon:WalletCards},
  {href:'/admin/pagamentos',label:'Preparar testes de pagamento',icon:CreditCard},
  {href:'/admin/reservas',label:'Ver reservas de teste',icon:Timer},
  {href:'/admin/frete',label:'Cadastrar embalagens e frete',icon:PackagePlus},
  {href:'/admin/remessas',label:'Preparar remessas',icon:ClipboardList},
  {href:'/admin/fiscal',label:'Preparar documentos fiscais e etiquetas',icon:FileText},
  {href:'/admin/prontidao',label:'Ver prontidão de lançamento',icon:ClipboardCheck}
 ];
 const quickCandidates=quickFilter.trim()?
  searchAdminNavigation([...shortcuts,...allItems],quickFilter,40):shortcuts.slice(0,9);
 const quickResults=quickCandidates.filter((item,index,all)=>
  all.findIndex(other=>other.href===item.href)===index);
 const initials=currentUser.name.split(/\s+/).filter(Boolean).slice(0,2)
  .map(s=>s[0]?.toUpperCase()).join('')||'PB';
 function toggleCollapsed(){
  const next=!collapsed;setCollapsed(next);
  try{window.localStorage.setItem('pope-admin-collapsed',next?'1':'0');}catch{}
 }
 return <div className={'pope-admin-shell'+(collapsed?' is-collapsed':'')+(mobileOpen?' mobile-open':'')}>
  <aside id="pope-admin-sidebar" className="pope-admin-sidebar" aria-label="Navegação administrativa">
   <div className="pope-admin-brand">
    <Link href="/admin" className="pope-admin-brand-link" title="Popê Beauty — Gestão">
     <span className="pope-admin-brand-mark">♥</span>
     <span className="pope-admin-brand-words"><strong>Popê Beauty</strong><small>PAINEL ADMINISTRATIVO</small></span>
    </Link>
    <button className="pope-admin-collapse" type="button" onClick={toggleCollapsed}
     aria-label={collapsed?'Expandir menu lateral':'Recolher menu lateral'} title={collapsed?'Expandir':'Recolher'}>
     {collapsed?<PanelLeftOpen size={19}/>:<PanelLeftClose size={19}/>}
    </button>
    <button className="pope-admin-mobile-close" type="button" onClick={()=>setMobileOpen(false)}
     aria-label="Fechar menu"><X size={21}/></button>
   </div>
   <div className="pope-admin-merchant">
    <span className="pope-admin-merchant-icon"><Store size={18}/></span>
    <div className="pope-admin-merchant-text"><strong>Minha loja</strong><small>Popê Beauty · Gestão</small></div>
    <ShieldCheck className="pope-admin-merchant-check" size={17}/>
   </div>
   <nav className="pope-admin-sidebar-nav" aria-label="Módulos do sistema">
    <section className="pope-admin-nav-group pope-admin-nav-priority" aria-label="Acesso rápido">
     <span className="pope-admin-nav-caption">Acesso rápido</span>
     {primaryItems.map(item=>{
      const Icon=item.icon,active=currentHref===item.href;
      return <Link href={item.href} key={item.href}
       className={'pope-admin-nav-link'+(active?' active':'')}
       title={item.label} aria-current={active?'page':undefined}
       onClick={()=>setMobileOpen(false)}>
       <Icon size={19}/><span className="pope-admin-nav-label">{item.label}</span>
       {typeof item.count==='number'&&item.count>0?
        <span className="pope-admin-nav-count">{item.count>99?'99+':item.count}</span>:null}
      </Link>;
     })}
    </section>
    <span className="pope-admin-nav-caption pope-admin-nav-sections-caption">Áreas de trabalho</span>
    {groups.map(group=>{
     const GroupIcon=group.icon;
     const groupActive=activeGroup===group.id;
     const opened=openedGroup===group.id;
     const visible=opened&&(!collapsed||mobileOpen);
     const groupCount=group.items.reduce((sum,item)=>sum+(item.count??0),0);
     return <section key={group.id}
      className={'pope-admin-nav-group pope-admin-nav-accordion'+(groupActive?' is-current':'')}>
      <button type="button" className="pope-admin-nav-heading"
       title={group.title} aria-expanded={visible}
       aria-controls={'pope-admin-group-'+group.id}
       onClick={()=>{
        if(collapsed&&!mobileOpen){
         setCollapsed(false);
         try{window.localStorage.setItem('pope-admin-collapsed','0');}catch{}
         setOpenedGroup(group.id);
        }else setOpenedGroup(value=>value===group.id?'':group.id);
       }}>
       <GroupIcon size={19}/>
       <span className="pope-admin-nav-heading-label">{group.title}</span>
       {groupCount>0?<span className="pope-admin-nav-count">{groupCount>99?'99+':groupCount}</span>:null}
       <ChevronDown className={'pope-admin-nav-chevron'+(visible?' is-open':'')} size={15}/>
      </button>
      <div className="pope-admin-nav-children" id={'pope-admin-group-'+group.id}
       hidden={!visible}>
       {group.items.map(item=>{
        const Icon=item.icon,active=currentHref===item.href;
        return <Link href={item.href} key={item.href}
         className={'pope-admin-nav-link'+(active?' active':'')}
         title={item.label} aria-current={active?'page':undefined}
         onClick={()=>setMobileOpen(false)}>
         <Icon size={17}/><span className="pope-admin-nav-label">{item.label}</span>
         {typeof item.count==='number'&&item.count>0?
          <span className="pope-admin-nav-count">{item.count>99?'99+':item.count}</span>:null}
        </Link>;
       })}
      </div>
     </section>;
    })}
   </nav>
   <div className="pope-admin-sidebar-footer">
    <div className="pope-admin-session-card">
     <span className="pope-admin-avatar">{initials}</span>
     <div className="pope-admin-sidebar-user"><strong title={currentUser.name}>{currentUser.name}</strong>
      <small><span className="pope-admin-online-dot"/> Administrador · conectado</small></div>
    </div>
    <Link href="/conta" className="pope-admin-footer-link" title="Minha conta"><UserRound size={18}/><span>Minha conta</span></Link>
    <form action={signOutAction}><button type="submit" className="pope-admin-footer-link pope-admin-logout"
     title="Sair da conta"><LogOut size={18}/><span>Sair da conta</span></button></form>
   </div>
  </aside>
  {mobileOpen?<button aria-label="Fechar menu lateral" type="button"
   className="pope-admin-shade" onClick={()=>setMobileOpen(false)}/>:null}
  <div className="pope-admin-main">
   <header className="pope-admin-topbar">
    <div className="pope-admin-topbar-left">
     <button className="pope-admin-mobile-toggle" type="button"
      onClick={()=>setMobileOpen(v=>!v)} aria-label="Abrir menu lateral"
      aria-expanded={mobileOpen} aria-controls="pope-admin-sidebar"><Menu size={23}/></button>
     <div className="pope-admin-breadcrumb"><small>Popê Beauty <ChevronRight size={13}/></small>
      <strong>{current.label}</strong></div>
    </div>
    <div className="pope-admin-topbar-actions">
     <div className="pope-admin-dropdown-anchor">
      <button type="button" className="pope-admin-shortcut-trigger"
       aria-label="Abrir atalhos rápidos" aria-expanded={quickOpen}
       onClick={()=>{setQuickOpen(v=>!v);setProfileOpen(false);}}>
       <Search size={17}/><span>Atalhos rápidos</span><kbd>Ctrl K</kbd><ChevronDown size={14}/>
      </button>
      {quickOpen?<div className="pope-admin-menu pope-admin-quick-menu">
       <div className="pope-admin-quick-search"><Search size={17}/>
        <input autoFocus aria-label="Filtrar atalhos" value={quickFilter}
         onChange={e=>setQuickFilter(e.target.value)} placeholder="Buscar função..."/></div>
       <div className="pope-admin-quick-list">
        {quickResults.length?quickResults.map(item=>{const Icon=item.icon;return <Link key={item.href}
         href={item.href} onClick={()=>setQuickOpen(false)}><Icon size={17}/>{item.label}<ChevronRight size={13}/></Link>}):
         <p>Nenhum atalho encontrado.</p>}
       </div>
      </div>:null}
     </div>
     <Link href="/admin/usuarios-online" className="pope-admin-live-pill" title="Usuários com atividade nos últimos 3 minutos">
      <span className="pope-admin-online-dot"/><span>{onlineCount} ativos</span></Link>
     <div className="pope-admin-dropdown-anchor">
      <button type="button" className="pope-admin-user-trigger"
       aria-expanded={profileOpen} aria-label="Opções da conta administradora"
       onClick={()=>{setProfileOpen(v=>!v);setQuickOpen(false);}}>
       <span className="pope-admin-avatar">{initials}</span>
       <span className="pope-admin-top-user"><strong>{currentUser.name}</strong><small>{currentUser.email}</small></span>
       <ChevronDown size={16}/>
      </button>
      {profileOpen?<div className="pope-admin-menu pope-admin-account-menu">
       <div className="pope-admin-account-intro"><strong>{currentUser.name}</strong><small>{currentUser.email}</small>
        <span><span className="pope-admin-online-dot"/> Administrador autenticado</span></div>
       <Link href="/conta" onClick={()=>setProfileOpen(false)}><UserRound size={17}/> Minha conta</Link>
       <Link href="/" onClick={()=>setProfileOpen(false)}><ExternalLink size={17}/> Abrir loja</Link>
       <Link href="/admin/configuracoes" onClick={()=>setProfileOpen(false)}><Settings size={17}/> Configurações</Link>
       <form action={signOutAction}><button type="submit"><LogOut size={17}/> Sair da conta</button></form>
      </div>:null}
     </div>
    </div>
   </header>
   <div className="pope-admin-page">{children}</div>
   <div className="pope-admin-bottomline"><span>© Popê Beauty · Painel administrativo</span>
    <span><ShieldCheck size={14}/> Área protegida</span></div>
  </div>
 </div>;
}
