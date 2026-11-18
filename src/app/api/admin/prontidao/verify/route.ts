import {NextRequest} from 'next/server';
import {orderResponse,orderService,orderSession} from '@/lib/order-request';
import {focusConfig,focusRequest} from '@/lib/fiscal/focus-nfe';
import {mpLiveSellerConfig,verifyMpLiveSeller} from '@/lib/payments/mercado-pago-live';
import {TestSellerCredentialError,verifyMercadoPagoTestSellerCredentials} from '@/lib/payments/mercado-pago-test';
import {labelRequest} from '@/lib/shipping/melhor-envio-label';
import {verifyOrderSmtp} from '@/lib/order-smtp';
import {integrationPreflight,PROVIDERS,type PreflightProvider,type PreflightResult} from '@/lib/integration-preflight';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const result=(state:PreflightResult['state'],message:string)=>orderResponse({state,message} satisfies PreflightResult);
const denied=(status:number)=>status===401||status===403;

export async function POST(request:NextRequest){
 const session=await orderSession(request,true);
 if(session.error)return session.error;
 const input:unknown=await request.json().catch(()=>null);
 const id=input&&typeof input==='object'&&'id' in input?input.id:null;
 if(typeof id!=='string'||!PROVIDERS.includes(id as PreflightProvider))return orderResponse({error:'Selecione uma integração.'},400);
 const integration=integrationPreflight(process.env).find(card=>card.id===id);
 if(!integration?.canCheck)return result('pending','Confira os campos pendentes na Vercel e refaça o deploy.');
 try{
  switch(id as PreflightProvider){
   case 'smtp':
    return orderResponse(await verifyOrderSmtp());
   case 'supabase': {
    const service=orderService();
    if(!service)return result('pending','Acesso do servidor aguardando configuração.');
    const {data,error}=await service.from('fiscal_issuer_settings').select('id').eq('id',1).maybeSingle();
    return error||!data?result('blocked','A chave do servidor não conseguiu acessar o cadastro fiscal protegido.'):
     result('ready','A chave do servidor acessou o cadastro fiscal protegido.');
   }
   case 'mp-test':
    await verifyMercadoPagoTestSellerCredentials();
    return result('ready','Conta vendedora TEST do Brasil validada.');
   case 'mp-live': {
    const config=mpLiveSellerConfig();
    if(!config)return result('blocked','Confira o ID e o token da conta vendedora de produção.');
    await verifyMpLiveSeller(config);
    return result('ready','Conta vendedora de produção do Brasil validada.');
   }
   case 'focus': {
    const config=focusConfig();
    if(!config)return result('pending','Selecione o ambiente e configure o token correspondente.');
    const {data,error}=await session.sb.from('store_nfe_documents').select('reference')
     .eq('environment',config.environment).in('status',['authorized','cancelled']).order('updated_at',{ascending:false}).limit(1).maybeSingle();
    if(error)return result('blocked','Não foi possível consultar as referências fiscais registradas.');
    // A consulta usa um documento do ambiente selecionado, quando disponível.
    const response=await focusRequest(config,'/v2/nfe/'+encodeURIComponent(data?.reference??crypto.randomUUID()));
    if(denied(response.status))return result('blocked','O Focus NFe recusou a credencial para esse ambiente.');
    if(response.status===404&&!data)return result('pending','O Focus NFe respondeu. A primeira NF-e deste ambiente permitirá confirmar a consulta ao documento.');
    if(!response.ok)return result('blocked','O Focus NFe não conseguiu consultar a referência fiscal.');
    const payload=await response.json() as {status?:unknown};
    return data&&['autorizado','cancelado'].includes(String(payload.status))?
     result('ready','Consulta ao documento confirmada no Focus NFe em '+config.environment+'.'):
     result('pending','Confira a situação do primeiro documento no Focus NFe.');
   }
   case 'melhor-envio-sandbox':
   case 'melhor-envio-live': {
    const sandbox=id==='melhor-envio-sandbox';
    const token=(sandbox?process.env.MELHOR_ENVIO_SANDBOX_TOKEN:process.env.MELHOR_ENVIO_PRODUCTION_TOKEN)?.trim();
    if(!token)return result('pending','Configure o token do Melhor Envio para este ambiente.');
    const email=process.env.MELHOR_ENVIO_CONTACT_EMAIL?.trim()||'popebeauty.e@gmail.com';
    const base=sandbox?'https://sandbox.melhorenvio.com.br':'https://melhorenvio.com.br';
    const response=await labelRequest({token,email,base},'shipment/services');
    if(denied(response.status))return result('blocked','O Melhor Envio recusou o token ou o escopo de consulta.');
    if(!response.ok)return result('blocked','O Melhor Envio não conseguiu listar os serviços.');
    const services:unknown=await response.json();
    return Array.isArray(services)?result('ready','Consulta de serviços aceita pelo Melhor Envio em '+(sandbox?'sandbox':'produção')+'.'):
     result('blocked','O Melhor Envio retornou um formato de resposta inesperado.');
   }
  }
 }catch(error){
  if(error instanceof TestSellerCredentialError)return result('blocked',error.message);
  return result('blocked','A consulta falhou. Confira a credencial e a disponibilidade do provedor.');
 }
}
