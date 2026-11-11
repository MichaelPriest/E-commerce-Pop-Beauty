import 'server-only';
import {PAYMENT_GATEWAYS,isPaymentGatewayId,type PaymentGatewayId} from '@/lib/payment-gateways';

export type GatewayEnvironment={
 provider:PaymentGatewayId;configured:boolean;presentKeys:string[];
 missingKeys:string[];supportsReadOnlyTest:boolean;sandbox:string;
};
const present=(key:string)=>!!process.env[key]?.trim();

export function paymentGatewayEnvironments():GatewayEnvironment[]{
 return PAYMENT_GATEWAYS.map(g=>{
  const keys=[...g.envKeys];
  const missingKeys=keys.filter(key=>!present(key));
  return {
   provider:g.id,configured:keys.length>0&&missingKeys.length===0,
   presentKeys:keys.filter(present),missingKeys,
   supportsReadOnlyTest:g.check==='remote',sandbox:g.sandbox
  };
 });
}

type ConnectionResult={
 provider:PaymentGatewayId;result:'connected'|'missing_credentials'|'unsupported'|'rejected'|'network_error';
 message:string;
};
const sandboxGet=async(url:string,headers:Record<string,string>)=>{
 const response=await fetch(url,{
  method:'GET',headers,cache:'no-store',signal:AbortSignal.timeout(8000),redirect:'error'
 });
 return response.status;
};
export async function testGatewaySandboxReadOnly(provider:PaymentGatewayId):Promise<ConnectionResult>{
 const definition=PAYMENT_GATEWAYS.find(g=>g.id===provider);
 if(!definition||!isPaymentGatewayId(provider))throw new Error('Provedor inválido');
 if(definition.sandbox==='none')return {provider,result:'unsupported',message:'Este provedor não oferece sandbox; nenhum teste foi enviado.'};
 if(definition.check!=='remote')return {provider,result:'unsupported',
  message:'Variáveis podem ser configuradas, mas não há teste automatizado de conexão para esta API.'};
 const credentials=paymentGatewayEnvironments().find(g=>g.provider===provider)!;
 if(!credentials.configured)return {provider,result:'missing_credentials',
  message:'Adicione no servidor as credenciais de sandbox indicadas no painel antes de testar.'};
 try{
  let status:number;
  switch(provider){
   case 'mercado_pago':
    status=await sandboxGet('https://api.mercadopago.com/users/me',{
     Authorization:'Bearer '+process.env.MP_TEST_ACCESS_TOKEN!,
     Accept:'application/json'
    });
    break;
   case 'pagarme':{
    const secret=process.env.PAGARME_TEST_SECRET_KEY!;
    if(!secret.startsWith('sk_test_'))return {provider,result:'rejected',
     message:'A chave configurada não possui o prefixo sk_test_ esperado para a homologação.'};
    status=await sandboxGet('https://sdx-api.pagar.me/core/v5/paymentlinks?page=1&per_page=1',{
     Authorization:'Basic '+Buffer.from(secret+':').toString('base64'),
     Accept:'application/json','User-Agent':'PopeBeautySandbox/1.0'
    });
    break;
   }
   case 'asaas':
    status=await sandboxGet('https://api-sandbox.asaas.com/v3/paymentLinks?limit=1',{
     access_token:process.env.ASAAS_SANDBOX_API_KEY!,
     Accept:'application/json','User-Agent':'PopeBeautySandbox/1.0'
    });
    break;
   case 'stripe':{
    const secret=process.env.STRIPE_TEST_SECRET_KEY!;
    if(!secret.startsWith('sk_test_'))return {provider,result:'rejected',
     message:'A chave configurada não é uma chave Stripe de testes (sk_test_).'};
    status=await sandboxGet('https://api.stripe.com/v1/account',{
     Authorization:'Bearer '+secret
    });
    break;
   }
   case 'paypal':{
    const client=process.env.PAYPAL_SANDBOX_CLIENT_ID!;
    const secret=process.env.PAYPAL_SANDBOX_CLIENT_SECRET!;
    const response=await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token',{
     method:'POST',redirect:'error',cache:'no-store',
     headers:{
      Authorization:'Basic '+Buffer.from(client+':'+secret).toString('base64'),
      'Content-Type':'application/x-www-form-urlencoded',
      Accept:'application/json'
     },
     body:'grant_type=client_credentials',
     signal:AbortSignal.timeout(8000)
    });
    status=response.status;
    break;
   }
   default:return {provider,result:'unsupported',message:'Teste não disponível.'};
  }
  // Autenticação/remetente validados por chamada exclusivamente de leitura/autorização.
  if(status>=200&&status<300)return {provider,result:'connected',
   message:'A API respondeu à consulta de autenticação no ambiente de teste. Nenhum pagamento foi criado.'};
  if(status===401||status===403)return {provider,result:'rejected',
   message:'API recusou as credenciais do teste (HTTP '+status+'). Revise as chaves e o ambiente.'};
  return {provider,result:'rejected',
   message:'A API retornou HTTP '+status+' na consulta de teste. Revise a documentação e a conta de sandbox.'};
 }catch{
  return {provider,result:'network_error',
   message:'Não foi possível consultar a API de testes. Verifique conectividade e credenciais no painel Vercel.'};
 }
}
