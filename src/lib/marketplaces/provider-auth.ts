import 'server-only';
import {createHash,randomBytes} from 'node:crypto';
import {shopeeSignature} from './shopee-signature-core';

export type MarketplaceChannel='shopee'|'mercadolivre';
export type MarketplaceTokens={access:string;refresh:string;expiresIn:number};
const sellerIdPattern=/^[1-9][0-9]{1,20}$/;
export function isMarketplaceChannel(v:string):v is MarketplaceChannel{
 return v==='shopee'||v==='mercadolivre';
}
export function marketplaceOrigin(){
 const raw=process.env.MARKETPLACE_OAUTH_ORIGIN?.trim()||
  'https://e-commerce-pope-beauty.vercel.app';
 let u:URL;
 try{u=new URL(raw);}catch{throw new Error('MARKETPLACE_OAUTH_ORIGIN inválido.');}
 if(u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash||u.username||u.password)
  throw new Error('A origem OAuth precisa ser HTTPS sem caminho.');
 return u.origin;
}
export function marketplaceCallback(channel:MarketplaceChannel){
 return marketplaceOrigin()+'/api/admin/marketplaces/oauth/callback/'+channel;
}
export function providerConfigured(channel:MarketplaceChannel){
 if(channel==='mercadolivre')
  return Boolean(process.env.MELI_APP_ID?.trim()&&process.env.MELI_CLIENT_SECRET?.trim());
 return Boolean(process.env.SHOPEE_PARTNER_ID?.trim()&&process.env.SHOPEE_PARTNER_KEY?.trim());
}
export function shopeeCredentials(){
 const id=process.env.SHOPEE_PARTNER_ID?.trim()??'';
 const key=process.env.SHOPEE_PARTNER_KEY?.trim()??'';
 if(!sellerIdPattern.test(id)||key.length<8)
  throw new Error('Cadastre Partner ID e Partner Key no servidor.');
 return {id,key};
}
function meliCredentials(){
 const id=process.env.MELI_APP_ID?.trim()??'';
 const secret=process.env.MELI_CLIENT_SECRET?.trim()??'';
 if(!sellerIdPattern.test(id)||secret.length<8)
  throw new Error('Cadastre App ID e Client Secret do Mercado Livre.');
 return {id,secret};
}
function checkTokens(value:unknown):MarketplaceTokens{
 if(!value||typeof value!=='object')throw new Error('Token não retornado.');
 const v=value as Record<string,unknown>;
 const seconds=Number(v.expires_in??v.expire_in);
 if(typeof v.access_token!=='string'||v.access_token.length<8||
  typeof v.refresh_token!=='string'||v.refresh_token.length<8||
  !Number.isInteger(seconds)||seconds<60||seconds>86400)
  throw new Error('Resposta de token inválida.');
 return {access:v.access_token,refresh:v.refresh_token,expiresIn:seconds};
}
async function postForm(url:string,params:URLSearchParams){
 const response=await fetch(url,{method:'POST',cache:'no-store',redirect:'error',
  signal:AbortSignal.timeout(10000),
  headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},
  body:params.toString()});
 if(!response.ok)throw new Error('Marketplace recusou autorização (HTTP '+response.status+').');
 return await response.json() as Record<string,unknown>;
}
export function marketplaceAuthorizeURL(channel:MarketplaceChannel,state:string,verifier:string){
 if(channel==='mercadolivre'){
  const {id}=meliCredentials();
  const url=new URL('https://auth.mercadolivre.com.br/authorization');
  url.searchParams.set('response_type','code');
  url.searchParams.set('client_id',id);
  url.searchParams.set('redirect_uri',marketplaceCallback(channel));
  url.searchParams.set('state',state);
  url.searchParams.set('code_challenge',createHash('sha256').update(verifier).digest('base64url'));
  url.searchParams.set('code_challenge_method','S256');
  return url.toString();
 }
 const {id}=shopeeCredentials();
 const url=new URL('https://open.shopee.com.br/auth');
 url.searchParams.set('partner_id',id);
 url.searchParams.set('auth_type','seller');
 url.searchParams.set('redirect_uri',marketplaceCallback(channel));
 url.searchParams.set('response_type','code');
 url.searchParams.set('state',state);
 return url.toString();
}
export function generateOAuthNonce(){return randomBytes(32).toString('base64url');}
export async function exchangeMarketplaceCode(
 channel:MarketplaceChannel,code:string,opts:{verifier:string;shopId?:string}
):Promise<{tokens:MarketplaceTokens;accountId:string;name:string}>{
 if(!code||code.length>1000)throw new Error('Código de autorização inválido.');
 if(channel==='mercadolivre'){
  const {id,secret}=meliCredentials();
  const response=await postForm('https://api.mercadolibre.com/oauth/token',
   new URLSearchParams({
    grant_type:'authorization_code',client_id:id,client_secret:secret,
    code,redirect_uri:marketplaceCallback(channel),code_verifier:opts.verifier
   }));
  const tokens=checkTokens(response);
  const me=await meliGET('/users/me',tokens.access);
  const accountId=String(me.id??'');
  if(!sellerIdPattern.test(accountId)||me.site_id!=='MLB')
   throw new Error('Conta do Mercado Livre não corresponde ao Brasil.');
  return {tokens,accountId,name:
   typeof me.nickname==='string'?me.nickname.slice(0,160):'Mercado Livre '+accountId};
 }
 const {id}=shopeeCredentials();
 if(!opts.shopId||!sellerIdPattern.test(opts.shopId))
  throw new Error('A conexão Shopee exige shop_id válido.');
 const data=await shopeePublicPOST('/api/v2/auth/token/get',{
  code,shop_id:Number(opts.shopId),partner_id:Number(id)
 });
 const tokens=checkTokens(data);
 const info=await shopeeShopGET('/api/v2/shop/get_shop_info',tokens.access,opts.shopId);
 return {tokens,accountId:opts.shopId,
  name:typeof info.shop_name==='string'?info.shop_name.slice(0,160):'Shopee '+opts.shopId};
}
export async function refreshMarketplaceToken(
 channel:MarketplaceChannel,refresh:string,accountId:string
):Promise<MarketplaceTokens>{
 if(channel==='mercadolivre'){
  const {id,secret}=meliCredentials();
  const response=await postForm('https://api.mercadolibre.com/oauth/token',
   new URLSearchParams({
    grant_type:'refresh_token',client_id:id,client_secret:secret,
    refresh_token:refresh
   }));
  if(String(response.user_id??'')!==accountId)
   throw new Error('Renovação retornou outra conta do Mercado Livre.');
  return checkTokens(response);
 }
 const {id}=shopeeCredentials();
 const data=await shopeePublicPOST('/api/v2/auth/access_token/get',{
  refresh_token:refresh,shop_id:Number(accountId),partner_id:Number(id)
 });
 return checkTokens(data);
}
export async function shopeePublicPOST(path:string,body:Record<string,unknown>){
 const {id,key}=shopeeCredentials(),timestamp=Math.floor(Date.now()/1000);
 const url=new URL('https://openplatform.shopee.com.br'+path);
 url.searchParams.set('partner_id',id);
 url.searchParams.set('timestamp',String(timestamp));
 url.searchParams.set('sign',shopeeSignature(id,key,path,timestamp));
 const response=await fetch(url,{method:'POST',cache:'no-store',redirect:'error',
  signal:AbortSignal.timeout(11000),
  headers:{'Content-Type':'application/json',Accept:'application/json'},
  body:JSON.stringify(body)});
 if(!response.ok)throw new Error('Shopee recusou solicitação (HTTP '+response.status+').');
 const raw=await response.json() as Record<string,unknown>;
 if(raw.error&&raw.error!=='')throw new Error('Shopee retornou erro de API. Verifique permissões.');
 return raw;
}
export async function shopeeShopGET(path:string,token:string,shopId:string,
 fields:Record<string,string|string[]>={}){
 const {id,key}=shopeeCredentials(),timestamp=Math.floor(Date.now()/1000);
 if(!sellerIdPattern.test(shopId))throw new Error('Shop ID inválido.');
 const url=new URL('https://openplatform.shopee.com.br'+path);
 url.searchParams.set('partner_id',id);
 url.searchParams.set('timestamp',String(timestamp));
 url.searchParams.set('access_token',token);
 url.searchParams.set('shop_id',shopId);
 url.searchParams.set('sign',shopeeSignature(id,key,path,timestamp,token,shopId));
 for(const [name,value] of Object.entries(fields)){
  if(Array.isArray(value))for(const v of value)url.searchParams.append(name,v);
  else url.searchParams.set(name,value);
 }
 const response=await fetch(url,{method:'GET',cache:'no-store',redirect:'error',
  signal:AbortSignal.timeout(11000),headers:{Accept:'application/json'}});
 if(!response.ok)throw new Error('Shopee recusou consulta (HTTP '+response.status+').');
 const raw=await response.json() as Record<string,unknown>;
 if(raw.error&&raw.error!=='')throw new Error('Shopee informou erro de API. Confira autorização.');
 return raw;
}
export async function meliGET(path:string,token:string){
 if(!/^\/[a-zA-Z0-9/?=&_.,%-]+$/.test(path))throw new Error('Endpoint inválido.');
 const response=await fetch('https://api.mercadolibre.com'+path,{
  method:'GET',cache:'no-store',redirect:'error',
  signal:AbortSignal.timeout(11000),
  headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
 if(!response.ok)throw new Error('Mercado Livre recusou consulta (HTTP '+response.status+').');
 return await response.json() as Record<string,unknown>;
}
