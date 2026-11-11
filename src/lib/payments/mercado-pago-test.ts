import 'server-only';
const mpApi='https://api.mercadopago.com';
const testSellerNick=/^TEST[A-Z0-9_-]{4,50}$/i;
export type TestSeller={id:number;nickname:string;site_id:string};
export type MpTestPreference={id:string;init_point:string;collector_id:number};

export function sandboxPreferenceEnabled(){
 return process.env.MP_TEST_PREFERENCE_CREATION_ENABLED==='verified-test-account-only'
  && Boolean(process.env.MP_TEST_ACCESS_TOKEN?.trim())
  && /^[1-9][0-9]{3,20}$/.test(process.env.MP_TEST_SELLER_ID??'');
}
export async function verifyMercadoPagoTestSeller():Promise<{token:string;seller:TestSeller}>{
 if(!sandboxPreferenceEnabled())throw new Error('Ambiente de preferências de teste não habilitado.');
 const token=process.env.MP_TEST_ACCESS_TOKEN!.trim();
 const expectedId=process.env.MP_TEST_SELLER_ID!.trim();
 // O prefixo APP_USR aparece em credenciais de teste E produção; não comprova sandbox.
 if(!token.startsWith('APP_USR-'))throw new Error('Access Token inválido para Checkout Pro de testes.');
 const response=await fetch(mpApi+'/users/me',{
  method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},
  cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)
 });
 if(!response.ok)throw new Error('Credencial recusada na autenticação Mercado Pago.');
 const seller=await response.json() as Record<string,unknown>;
 const id=Number(seller.id);
 const nickname=typeof seller.nickname==='string'?seller.nickname:'';
 const site_id=typeof seller.site_id==='string'?seller.site_id:'';
 if(!Number.isSafeInteger(id)||String(id)!==expectedId||
  !testSellerNick.test(nickname)||site_id!=='MLB'){
  throw new Error('O token não pertence à conta vendedora TEST declarada para o Brasil. Nenhuma preferência será criada.');
 }
 return {token,seller:{id,nickname,site_id}};
}
export async function createMpTestPreference(params:{
 token:string;seller:TestSeller;attemptId:string;orderId:string;
 items:Array<{title:string;quantity:number;priceCents:number;sku:string}>;
 expiresAt:string;
}):Promise<MpTestPreference>{
 const total= params.items.reduce((sum,x)=>sum+x.priceCents*x.quantity,0);
 if(!Number.isSafeInteger(total)||total<=0||params.items.length===0)
  throw new Error('Produtos inválidos para o teste.');
 const now=new Date();
 const expires=new Date(params.expiresAt);
 if(!Number.isFinite(expires.getTime())||expires.getTime()-now.getTime()<60000)
  throw new Error('Reserva sem tempo suficiente para testes.');
 const origin='https://e-commerce-pope-beauty.vercel.app';
 const preference={
  items:params.items.map(i=>({
   id:i.sku.slice(0,100),title:i.title.slice(0,120),
   quantity:i.quantity,currency_id:'BRL',unit_price:i.priceCents/100
  })),
  external_reference:'pope-sandbox:'+params.attemptId,
  metadata:{pope_environment:'sandbox',pope_attempt_id:params.attemptId,
   pope_order_id:params.orderId},
  back_urls:{
   success:origin+'/admin/pagamentos?mp_sandbox_return=success',
   pending:origin+'/admin/pagamentos?mp_sandbox_return=pending',
   failure:origin+'/admin/pagamentos?mp_sandbox_return=failure'
  },
  expires:true,
  expiration_date_from:now.toISOString(),
  expiration_date_to:expires.toISOString()
 };
 const response=await fetch(mpApi+'/checkout/preferences',{
  method:'POST',cache:'no-store',redirect:'error',
  headers:{Authorization:'Bearer '+params.token,
   'Content-Type':'application/json',Accept:'application/json'},
  body:JSON.stringify(preference),signal:AbortSignal.timeout(10000)
 });
 if(!response.ok)throw new Error('Mercado Pago não aceitou a preferência de testes (HTTP '+response.status+').');
 const result=await response.json() as Record<string,unknown>;
 const collectorId=Number(result.collector_id);
 const id=typeof result.id==='string'?result.id:'';
 const url=typeof result.init_point==='string'?result.init_point:'';
 let u:URL;
 try{u=new URL(url);}catch{throw new Error('O Mercado Pago retornou link inválido.');}
 if(collectorId!==params.seller.id||!id||
  u.protocol!=='https:'||
  !['www.mercadopago.com','mercadopago.com'].includes(u.hostname)){
  throw new Error('O Mercado Pago retornou coletor ou endereço diferente do vendedor TEST. Link bloqueado.');
 }
 return {id,init_point:url,collector_id:collectorId};
}
