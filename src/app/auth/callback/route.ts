import {NextResponse,type NextRequest} from 'next/server';
import {isSupabaseConfigured} from '@/lib/supabase/config';
import {createClient} from '@/lib/supabase/server';

export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const url=new URL(request.url);
 const code=url.searchParams.get('code');
 const tokenHash=url.searchParams.get('token_hash');
 const type=url.searchParams.get('type');
 const next=url.searchParams.get('next');
 // Only fixed paths are permitted, avoiding open redirects from callback input.
 const recovery=next==='/redefinir-senha'||type==='recovery';
 const successPath=recovery?'/redefinir-senha':'/conta';
 const errorPath=recovery?'/esqueci-senha?erro=link':'/entrar?erro=confirmacao';
 const go=(path:string)=>{
  const response=NextResponse.redirect(new URL(path,url.origin),{status:303});
  response.headers.set('Cache-Control','private, no-store, max-age=0');
  response.headers.set('Referrer-Policy','no-referrer');
  return response;
 };
 if(!isSupabaseConfigured())return go(errorPath);
 if(url.searchParams.has('error')||url.searchParams.has('error_code'))return go(errorPath);
 const supabase=await createClient();
 try{
  if(code){
   const {error}=await supabase.auth.exchangeCodeForSession(code);
   if(error)return go(errorPath);
   return go(successPath);
  }
  // Also accepts the token_hash approach for a future customized Supabase
  // recovery template; never accept raw tokens as password update authority.
  if(tokenHash&&tokenHash.length<512&&type==='recovery'){
   const {error}=await supabase.auth.verifyOtp({type:'recovery',token_hash:tokenHash});
   if(error)return go('/esqueci-senha?erro=link');
   return go('/redefinir-senha');
  }
 }catch{return go(errorPath);}
 return go(errorPath);
}
