import type { Metadata } from 'next';
import { Header } from '@/components/header';
import './globals.css';
import './cliente.css';
import {getAdultStatus} from '@/lib/adult';
import {getStorefrontCustomer} from '@/lib/storefront-customer';
import {StorefrontSession} from '@/components/storefront-session';
import {SiteFooter} from '@/components/site-footer';
import {SessionPresence} from '@/components/session-presence';
export const dynamic='force-dynamic';
export const metadata: Metadata = { title:'Popê Beauty | Beleza acessível, sempre com alto astral', description:'Loja de maquiagem, skincare, acessórios e kits de beleza.' };
export default async function RootLayout({children}:{children:React.ReactNode}) {
 const [adult,customer]=await Promise.all([getAdultStatus(),getStorefrontCustomer()]);
 return <html lang="pt-BR"><body>
  <StorefrontSession userId={customer?.id??null}/>
  {customer?<SessionPresence key={customer.id}/>:null}
  <Header adultAccess={adult.enabled&&adult.verified} customerName={customer?customer.name.split(/\s+/)[0]:null}/>
  <main>{children}</main>
  <SiteFooter/>
 </body></html>;
}
