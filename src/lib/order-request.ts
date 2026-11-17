import 'server-only';
import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {createClient as connectService} from '@supabase/supabase-js';

export const orderUuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export const privateHeaders={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer'};

export function orderResponse(body:object,status=200){
 return NextResponse.json(body,{status,headers:privateHeaders});
}

export function hasSameOrigin(request:NextRequest){
 const header=request.headers.get('origin');
 if(!header)return false;
 try{
  const origin=new URL(header);
  return header===origin.origin&&origin.protocol===request.nextUrl.protocol&&
   origin.host===request.headers.get('host')?.toLowerCase();
 }catch{return false;}
}

export async function orderSession(request:NextRequest,adminOnly=false){
 if(request.method!=='GET'&&!hasSameOrigin(request))
  return {error:orderResponse({error:'Origem não autorizada.'},403)} as const;
 const sb=await createClient();
 const {data,error}=await sb.auth.getClaims();
 const user=data?.claims?.sub;
 if(error||!user||data.claims.is_anonymous===true)
  return {error:orderResponse({error:'Entre na sua conta para continuar.'},401)} as const;
 if(adminOnly){
  const {data:profile}=await sb.from('profiles').select('role').eq('id',user).maybeSingle();
  if(profile?.role!=='admin')return {error:orderResponse({error:'Acesso restrito à administração.'},403)} as const;
 }
 return {sb,user} as const;
}

export function orderService(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
 return url&&key?connectService(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null;
}
