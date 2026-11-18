'use client';
import Link from 'next/link';
import {useState,useSyncExternalStore} from 'react';
import {usePathname} from 'next/navigation';
import {Heart,Menu,Search,ShoppingBag,UserRound,X} from 'lucide-react';
import {Brand} from './brand';
import {cartQuantity} from '@/lib/cart-core';
import {cartStore} from '@/lib/storefront-lists';

const getCartCount=()=>cartQuantity(cartStore.getSnapshot());
export function Header({adultAccess=false,customerName}:{adultAccess?:boolean;customerName:string|null}){
 const [open,setOpen]=useState(false),[search,setSearch]=useState('');
 const pathname=usePathname();
 const count=useSyncExternalStore(cartStore.subscribe,getCartCount,()=>0);
 const signedIn=customerName!==null;
 const accountText=signedIn?(customerName?'Olá, '+customerName:'Minha conta'):'Entrar';
 if(pathname.startsWith('/admin'))return null;
 return <><div className="topbar">✨ Beleza acessível, sempre com alto astral! 💖 <span>• Frete e promoções serão anunciados em breve</span></div>
 <header className="site-header"><div className="header-inner container">
 <Brand/>
 <form className="header-search" action="/" onSubmit={e=>{if(!search.trim())e.preventDefault();}}>
 <Search size={21}/><input aria-label="Buscar produtos" placeholder="Busque makes, skincare, kits..." value={search} onChange={e=>setSearch(e.target.value)} name="q"/><button type="submit" aria-label="Pesquisar"><Search size={21}/></button>
 </form>
 <div className="header-actions">
  <Link className="header-account" href={signedIn?'/conta':'/entrar'}
   aria-label={signedIn?'Minha conta, '+(customerName||'sessão iniciada'):'Entrar na minha conta'}
   aria-current={pathname==='/conta'?'page':undefined} onClick={()=>setOpen(false)}>
   <span className={'header-icon'+(signedIn?' signed-in':'')}><UserRound aria-hidden="true"/></span>
   <small>{accountText}</small>
  </Link>
  <Link href="/favoritos" aria-label="Favoritos" aria-current={pathname==='/favoritos'?'page':undefined} onClick={()=>setOpen(false)}>
   <Heart aria-hidden="true"/><small>Favoritos</small>
  </Link>
  <Link href="/carrinho" aria-label={'Carrinho, '+count+(count===1?' item':' itens')}
   aria-current={pathname==='/carrinho'?'page':undefined} onClick={()=>setOpen(false)}>
   <span className="header-icon"><ShoppingBag aria-hidden="true"/><span className="cart-count" aria-hidden="true">{count}</span></span><small>Carrinho</small>
  </Link>
  <span className="customer-sr-only" role="status" aria-atomic="true">{count} {count===1?'item no carrinho':'itens no carrinho'}</span>
 </div>
 <button type="button" className="mobile-menu" aria-label={open?'Fechar menu':'Abrir menu'} aria-expanded={open}
  aria-controls="store-categories" onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button>
 </div></header>
 <nav id="store-categories" className={'navbar '+(open?'nav-open':'')} aria-label="Categorias"><div className="container nav-items">
 <Link href="/#categorias" onClick={()=>setOpen(false)}>☰ Todas as categorias</Link><Link href="/?categoria=Make" onClick={()=>setOpen(false)}>💄 Make</Link><Link href="/?categoria=Skincare" onClick={()=>setOpen(false)}>🧴 Skincare</Link><Link href="/?categoria=Acessórios" onClick={()=>setOpen(false)}>🖌️ Acessórios</Link><Link href="/?categoria=Kits" onClick={()=>setOpen(false)}>🎁 Kits</Link>{adultAccess?<Link href="/adulto" onClick={()=>setOpen(false)}>🔒 Bem-estar íntimo +18</Link>:null}<Link href="/#achadinhos" className="nav-deals" onClick={()=>setOpen(false)}>✦ Achadinhos da Popê</Link>
 </div></nav></>;
}
