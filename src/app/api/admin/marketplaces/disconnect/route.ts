import {NextRequest,NextResponse} from 'next/server';
import {marketplaceAdminSession} from '@/lib/marketplaces/session';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i;
export async function POST(request:NextRequest){
 const headers={'Cache-Control':'private, no-store'};
 const origin=request.headers.get('origin');
 let host='';
 try{host=origin?new URL(origin).host:'';}catch{}
 if(!host||host!==new URL(request.url).host)return NextResponse.json(
  {error:'Origem não autorizada.'},{status:403,headers});
 const sb=await marketplaceAdminSession();
 if(!sb)return NextResponse.json({error:'Acesso negado.'},{status:403,headers});
 let body:unknown;
 try{body=await request.json();}catch{
  return NextResponse.json({error:'Solicitação inválida.'},{status:400,headers});
 }
 const id=body&&typeof body==='object'&&'connection_id' in body?
  (body as {connection_id:unknown}).connection_id:null;
 if(typeof id!=='string'||!uuid.test(id))return NextResponse.json(
  {error:'Conta inválida.'},{status:400,headers});
 const {error}=await sb.rpc('disconnect_marketplace',{p_id:id});
 if(error)return NextResponse.json(
  {error:'Não foi possível desconectar esta conta.'},{status:409,headers});
 return NextResponse.json({
  success:true,
  message:'Tokens eliminados do sistema. Revogue também o acesso nas configurações da própria plataforma.'
 },{headers});
}
