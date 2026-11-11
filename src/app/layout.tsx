import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@/components/header';
import './globals.css';
import {getAdultStatus} from '@/lib/adult';
export const dynamic='force-dynamic';
export const metadata: Metadata = { title:'Popê Beauty | Beleza acessível, sempre com alto astral', description:'Loja de maquiagem, skincare, acessórios e kits de beleza.' };
export default async function RootLayout({children}:{children:React.ReactNode}) {
 const adult=await getAdultStatus();
 return <html lang="pt-BR"><body><Header adultAccess={adult.enabled&&adult.verified}/><main>{children}</main><footer className="footer"><div className="container footer-columns"><div><strong>💖 Popê Beauty</strong><p>Beleza acessível, sempre com alto astral!</p></div><div><strong>Navegue</strong><Link href="/">Início</Link><Link href="/entrar">Minha conta</Link></div><div><strong>Informações</strong><p>Loja em desenvolvimento. Produtos e preços de demonstração não são ofertas reais.</p></div></div></footer></body></html>;
}
