'use client';
import {usePathname} from 'next/navigation';
import Link from 'next/link';
export function SiteFooter(){
 const path=usePathname();
 if(path.startsWith('/admin'))return null;
 return <footer className="footer"><div className="container footer-columns">
  <div><strong>💖 Popê Beauty</strong><p>Beleza acessível, sempre com alto astral!</p></div>
  <div><strong>Navegue</strong><Link href="/">Início</Link><Link href="/entrar">Minha conta</Link></div>
  <div><strong>Informações</strong><p>Loja em desenvolvimento. Produtos e preços de demonstração não são ofertas reais.</p></div>
 </div></footer>;
}
