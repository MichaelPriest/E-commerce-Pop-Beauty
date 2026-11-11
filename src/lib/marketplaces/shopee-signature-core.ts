import {createHmac} from 'node:crypto';
/** Shopee Open Platform v2: assinatura pública e assinatura vinculada à loja. */
export function shopeeSignature(
 partnerId:string,partnerKey:string,path:string,timestamp:number,
 accessToken?:string,shopId?:string
){
 if(!/^[1-9]\d{2,20}$/.test(partnerId)||!/^\/api\/v2\/[a-z_/]+$/.test(path)||
  !Number.isInteger(timestamp)||timestamp<=0||!partnerKey)
  throw new Error('Parâmetros de assinatura Shopee inválidos');
 if((accessToken&&!shopId)||(!accessToken&&shopId))
  throw new Error('A assinatura da loja precisa do token e do ID');
 const raw=partnerId+path+timestamp+(accessToken??'')+(shopId??'');
 return createHmac('sha256',partnerKey).update(raw,'utf8').digest('hex');
}
