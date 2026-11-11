import {NextRequest,NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {marketplaceAdminSession} from '@/lib/marketplaces/session';
import {encryptMarketplaceToken,marketplaceVaultConfigured}
 from '@/lib/marketplaces/vault';
import {exchangeMarketplaceCode,isMarketplaceChannel,
 marketplaceOrigin} from '@/lib/marketplaces/provider-auth';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function equal(a:string,b:string){
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
}
export async function GET(request:NextRequest,{params}:{params:Promise<{channel:string}>}){
 const {channel}=await params;
 const returnTo=(code:string)=>NextResponse.redirect(
  new URL('/admin/marketplaces?connection='+code,request.url));
 if(!isMarketplaceChannel(channel))return returnTo('invalid');
 const responseFailure=(code:string)=>{
  const r=returnTo(code);
  r.cookies.delete({name:'pope_marketplace_oauth_'+channel,
   path:'/api/admin/marketplaces/oauth'});
  return r;
 };
 const sb=await marketplaceAdminSession();
 if(!sb)return responseFailure('denied');
 try{
  if(new URL(request.url).origin!==marketplaceOrigin()||!marketplaceVaultConfigured())
   return responseFailure('setup');
  const query=new URL(request.url).searchParams;
  const state=query.get('state')??'',code=query.get('code')??'';
  const cookie=request.cookies.get('pope_marketplace_oauth_'+channel)?.value??'';
  const [expected,verifier]=cookie.split('|');
  if(!expected||!verifier||expected.length<30||!equal(state,expected)||
   code.length<6||code.length>1000)return responseFailure('invalid');
  const data=await exchangeMarketplaceCode(channel,code,{
   verifier,shopId:query.get('shop_id')??undefined
  });
  const {error}=await sb.rpc('store_marketplace_authorization',{
   p_channel:channel,p_account:data.accountId,p_name:data.name,
   p_access_cipher:encryptMarketplaceToken(data.tokens.access),
   p_refresh_cipher:encryptMarketplaceToken(data.tokens.refresh),
   p_expires:new Date(Date.now()+data.tokens.expiresIn*1000).toISOString()
  });
  if(error)return responseFailure('storage');
  return responseFailure('connected');
 }catch{return responseFailure('provider');}
}
