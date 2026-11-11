'use client';
import {useEffect,useMemo,useState,type ReactNode,type ComponentType} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {
 LayoutDashboard,ShoppingBag,MailCheck,PackageSearch,Boxes,Truck,Users,
 CreditCard,Store,Eye,Settings,ShieldCheck,LogOut,UserRound,PanelLeftClose,
 PanelLeftOpen,Menu,X,ChevronDown,ChevronRight,Search,ExternalLink,
 CircleHelp,Activity,Plus,PackagePlus,ArrowLeft
} from 'lucide-react';
import {signOutAction} from '@/app/actions';

type IconType=ComponentType<{size?:number;strokeWidth?:number;className?:string}>;
type NavItem={href:string;label:string;icon:IconType;count?:number};
type NavGroup={title:string;items:NavItem[]};
type Props={
 children:ReactNode;
 currentUser:{name:string;email:string;role:string};
 onlineCount:number;pendingOrders:number;pendingNotifications:number;
};

export function AdminShell({children,currentUser,onlineCount,pendingOrders,pendingNotifications}:Props){
 const pathname=usePathname();
 const [collapsed,setCollapsed]=useState(false),[mobileOpen,setMobileOpen]=useState(false);
 const [quickOpen,setQuickOpen]=useState(false),[profileOpen,setProfileOpen]=useState(false);
 const [quickFilter,setQuickFilter]=useState('');
 useEffect(()=>{
  try{setCollapsed(window.localStorage.getItem('pope-admin-collapsed')==='1');}catch{}
 },[]);
 useEffect(()=>{setMobileOpen(false);setQuickOpen(false);setProfileOpen(false);},[pathname]);
 useEffect(()=>{
  if(!mobileOpen)return;
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setMobileOpen(false);};
  window.addEventListener('keydown',onKey);
  return ()=>window.removeEventListener('keydown',onKey);
 },[mobileOpen]);
 const groups:NavGroup[]=useMemo(()=>[
  {title:'Visão geral',items:[
   {href:'/admin',label:'Dashboard',icon:LayoutDashboard},
   {href:'/admin/pedidos',label:'Pedidos',icon:ShoppingBag,count:pendingOrders},
   {href:'/admin/notificacoes',label:'Notificações',icon:MailCheck,count:pendingNotifications}
  ]},
  {title:'Catálogo',items:[
   {href:'/admin/produtos',label:'Produtos',icon:PackageSearch},
   {href:'/admin/estoque',label:'Estoque e lotes',icon:Boxes},
   {href:'/admin/adulto',label:'Prévia reservada +18',icon:Eye}
  ]},
  {title:'Operação',items:[
   {href:'/admin/clientes',label:'Clientes',icon:Users},
   {href:'/admin/usuarios-online',label:'Usuários ativos',icon:Activity,count:onlineCount},
   {href:'/admin/logistica',label:'Logística',icon:Truck},
   {href:'/admin/financeiro',label:'Financeiro',icon:CreditCard},
   {href:'/admin/marketplaces',label:'Marketplaces',icon:Store}
  ]},
  {title:'Sistema',items:[
   {href:'/admin/configuracoes',label:'Configurações',icon:Settings}
  ]}
 ],[onlineCount,pendingOrders,pendingNotifications]);
 const current=groups.flatMap(g=>g.items).find(item=>item.href===pathname)
  ??groups.flatMap(g=>g.items).find(item=>item.href!=='/admin'&&pathname.startsWith(item.href+'/'))
  ??groups[0].items[0];
 const shortcuts:NavItem[]=[
  {href:'/admin/pedidos',label:'Novo pedido',icon:ShoppingBag},
  {href:'/admin/produtos',label:'Cadastrar produto',icon:PackagePlus},
  {href:'/admin/estoque',label:'Ajustar estoque',icon:Boxes},
  {href:'/admin/notificacoes',label:'Consultar e-mails',icon:MailCheck},
  {href:'/admin/usuarios-online',label:'Usuários ativos',icon:Activity}
 ];
 const quickResults=shortcuts.filter(item=>item.label.toLocaleLowerCase('pt-BR')
  .includes(quickFilter.toLocaleLowerCase('pt-BR')));
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
    {groups.map(group=><section key={group.title} className="pope-admin-nav-group">
     <span className="pope-admin-nav-caption">{group.title}</span>
     {group.items.map(item=>{
      const active=pathname===item.href||(item.href!=='/admin'&&pathname.startsWith(item.href+'/'));
      const Icon=item.icon;
      return <Link href={item.href} className={'pope-admin-nav-link'+(active?' active':'')}
       title={item.label} aria-current={active?'page':undefined} key={item.href}
       onClick={()=>setMobileOpen(false)}>
       <Icon size={19}/>
       <span className="pope-admin-nav-label">{item.label}</span>
       {typeof item.count==='number'&&item.count>0?<span className="pope-admin-nav-count">{item.count>99?'99+':item.count}</span>:null}
      </Link>;
     })}
    </section>)}
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
       <Search size={17}/><span>Atalhos rápidos</span><ChevronDown size={14}/>
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
