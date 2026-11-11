/** Shopee Open Platform v2 — URL oficial assinada da autorização de loja. */
export function signedShopeeAuthorizeUrl(options:{
 partnerId:string;redirect:string;timestamp:number;sign:string;
}):string{
 const {partnerId,redirect,timestamp,sign}=options;
 if(!/^[1-9][0-9]{2,20}$/.test(partnerId)||
  !Number.isSafeInteger(timestamp)||timestamp<=0||
  !/^[a-f0-9]{64}$/i.test(sign))throw new Error('Assinatura Shopee inválida.');
 const callback=new URL(redirect);
 if(callback.protocol!=='https:'||callback.username||callback.password||
  !callback.pathname.startsWith('/api/admin/marketplaces/oauth/callback/shopee')||
  callback.searchParams.getAll('state').length!==1||
  !/^[A-Za-z0-9_-]{40,100}$/.test(callback.searchParams.get('state')??'')){
  throw new Error('Callback Shopee não autorizado.');
 }
 const url=new URL('https://partner.shopeemobile.com/api/v2/shop/auth_partner');
 url.searchParams.set('partner_id',partnerId);
 url.searchParams.set('timestamp',String(timestamp));
 url.searchParams.set('sign',sign);
 url.searchParams.set('redirect',callback.toString());
 return url.toString();
}
