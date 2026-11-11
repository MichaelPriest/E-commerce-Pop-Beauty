import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {isPaymentGatewayId} from '@/lib/payment-gateways';
import {testGatewaySandboxReadOnly} from '@/lib/payment-gateways-server';

export const dynamic='force-dynamic';
export const runtime='nodejs';

export async function POST(request:NextRequest){
 const origin=request.headers.get('origin');
 if(!origin||new URL(origin).host!==new URL(request.url).host)
  return NextResponse.json({error:'Origem não autorizada'},{status:403});
 const supabase=await createClient();
 const {data:claims,error}=await supabase.auth.getClaims();
 if(error||!claims?.claims?.sub)return NextResponse.json({error:'Sessão necessária'},{status:401});
 const {data:profile}=await supabase.from('profiles').select('role')
  .eq('id',claims.claims.sub).maybeSingle();
 if(profile?.role!=='admin')return NextResponse.json({error:'Somente administrador'},{status:403});
 let payload:{provider?:unknown};
 try{payload=await request.json();}catch{
  return NextResponse.json({error:'Solicitação inválida'},{status:400});
 }
 if(!isPaymentGatewayId(payload.provider))
  return NextResponse.json({error:'Gateway inválido'},{status:400});
 const result=await testGatewaySandboxReadOnly(payload.provider);
 return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
}
