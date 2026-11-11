'use client';
import Link from 'next/link';
import { useState } from 'react';
import {usePathname} from 'next/navigation';
import { Heart, Menu, Search, ShoppingBag, UserRound, X } from 'lucide-react';
import { Brand } from './brand';
export function Header({adultAccess=false}:{adultAccess?:boolean}) {
 const [open,setOpen]=useState(false),[search,setSearch]=useState('');
 const pathname=usePathname();
 if(pathname.startsWith('/admin'))return null;
 return <><div className="topbar">✨ Beleza acessível, sempre com alto astral! 💖 <span>• Frete e promoções serão anunciados em breve</span></div>
 <header className="site-header"><div className="header-inner container">
 <Brand/>
 <form className="header-search" action="/" onSubmit={(e)=>{if(!search.trim()) e.preventDefault()}}>
 <Search size={21}/><input aria-label="Buscar produtos" placeholder="Busque makes, skincare, kits..." value={search} onChange={e=>setSearch(e.target.value)} name="q"/><button type="submit" aria-label="Pesquisar"><Search size={21}/></button>
 </form>
 <div className="header-actions"><Link href="/entrar" aria-label="Minha conta"><UserRound/><small>Minha conta</small></Link><Link href="/#destaques" aria-label="Favoritos"><Heart/><small>Favoritos</small></Link><Link href="/carrinho" aria-label="Carrinho"><ShoppingBag/><small>Carrinho</small></Link></div>
 <button className="mobile-menu" aria-label="Abrir menu" onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button>
 </div></header>
 <nav className={'navbar '+(open?'nav-open':'')} aria-label="Categorias"><div className="container nav-items">
 <Link href="/#categorias" onClick={()=>setOpen(false)}>☰ Todas as categorias</Link><Link href="/?categoria=Make" onClick={()=>setOpen(false)}>💄 Make</Link><Link href="/?categoria=Skincare" onClick={()=>setOpen(false)}>🧴 Skincare</Link><Link href="/?categoria=Acessórios" onClick={()=>setOpen(false)}>🖌️ Acessórios</Link><Link href="/?categoria=Kits" onClick={()=>setOpen(false)}>🎁 Kits</Link>{adultAccess?<Link href="/adulto" onClick={()=>setOpen(false)}>🔒 Bem-estar íntimo +18</Link>:null}<Link href="/#achadinhos" className="nav-deals" onClick={()=>setOpen(false)}>✦ Achadinhos da Popê</Link>
 </div></nav></>;
}
