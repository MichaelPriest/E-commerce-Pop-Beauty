import {NextRequest} from 'next/server';
import {orderResponse,orderSession} from '@/lib/order-request';
import {isPaymentGatewayId} from '@/lib/payment-gateways';
import {testGatewaySandboxReadOnly} from '@/lib/payment-gateways-server';

export const dynamic='force-dynamic';
export const runtime='nodejs';

export async function POST(request:NextRequest){
 const session=await orderSession(request,true);
 if(session.error)return session.error;
 let payload:unknown;
 try{payload=await request.json();}catch{
  return orderResponse({error:'Solicitação inválida'},400);
 }
 const provider=payload&&typeof payload==='object'&&'provider' in payload?payload.provider:null;
 if(!isPaymentGatewayId(provider))return orderResponse({error:'Gateway inválido'},400);
 return orderResponse(await testGatewaySandboxReadOnly(provider));
}
