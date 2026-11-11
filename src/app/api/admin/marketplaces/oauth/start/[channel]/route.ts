import {NextRequest,NextResponse} from 'next/server';
import {marketplaceAdminSession} from '@/lib/marketplaces/session';
import {marketplaceVaultConfigured} from '@/lib/marketplaces/vault';
import {generateOAuthNonce,isMarketplaceChannel,marketplaceAuthorizeURL,
 marketplaceOrigin,providerConfigured} from '@/lib/marketplaces/provider-auth';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:NextRequest,{params}:{params:Promise<{channel:string}>}){
 const {channel}=await params;
 const fail=(code:string)=>NextResponse.redirect(
  new URL('/admin/marketplaces?connection='+code,request.url));
 if(!isMarketplaceChannel(channel))return fail('invalid');
 const sb=await marketplaceAdminSession();
 if(!sb)return fail('denied');
 try{
  if(new URL(request.url).origin!==marketplaceOrigin()||
   !marketplaceVaultConfigured()||!providerConfigured(channel))return fail('setup');
  const state=generateOAuthNonce(),verifier=generateOAuthNonce();
  const url=marketplaceAuthorizeURL(channel,state,verifier);
  const response=NextResponse.redirect(url);
  response.headers.set('Cache-Control','no-store');
  response.cookies.set('pope_marketplace_oauth_'+channel,state+'|'+verifier,{
   httpOnly:true,secure:true,sameSite:'lax',path:'/api/admin/marketplaces/oauth',
   maxAge:600
  });
  return response;
 }catch{return fail('setup');}
}
