import type { Metadata } from 'next';
import { Header } from '@/components/header';
import './globals.css';
import {getAdultStatus} from '@/lib/adult';
import {createClient} from '@/lib/supabase/server';
import {isSupabaseConfigured} from '@/lib/supabase/config';
import {SiteFooter} from '@/components/site-footer';
import {SessionPresence} from '@/components/session-presence';
export const dynamic='force-dynamic';
export const metadata: Metadata = { title:'Popê Beauty | Beleza acessível, sempre com alto astral', description:'Loja de maquiagem, skincare, acessórios e kits de beleza.' };
export default async function RootLayout({children}:{children:React.ReactNode}) {
 const adult=await getAdultStatus();
 let authenticatedUserId:string|null=null;
 if(isSupabaseConfigured()){
  try{
   const sb=await createClient();
   const {data}=await sb.auth.getClaims();
   authenticatedUserId=data?.claims?.sub??null;
  }catch{/* Visitante sem sessão válida. */}
 }
 return <html lang="pt-BR"><body>
  {authenticatedUserId?<SessionPresence key={authenticatedUserId}/>:null}
  <Header adultAccess={adult.enabled&&adult.verified}/>
  <main>{children}</main>
  <SiteFooter/>
 </body></html>;
}
