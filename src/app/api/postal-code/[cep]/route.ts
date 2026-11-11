import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';

export const dynamic='force-dynamic';
export const runtime='nodejs';

export async function GET(_request:NextRequest,{params}:{params:Promise<{cep:string}>}){
 const noStore={'Cache-Control':'private, no-store'};
 const sb=await createClient();
 const {data:auth,error}=await sb.auth.getClaims();
 if(error||!auth?.claims?.sub){
  return NextResponse.json({error:'Entre na sua conta para consultar o CEP.'},{status:401,headers:noStore});
 }
 const {cep}=await params;
 if(!/^[0-9]{8}$/.test(cep)){
  return NextResponse.json({error:'Digite um CEP de 8 números.'},{status:400,headers:noStore});
 }
 try{
  const response=await fetch('https://viacep.com.br/ws/'+cep+'/json/',{
   method:'GET',cache:'no-store',redirect:'error',
   signal:AbortSignal.timeout(6500),
   headers:{Accept:'application/json'}
  });
  if(!response.ok)return NextResponse.json({error:'CEP indisponível para consulta.'},
   {status:502,headers:noStore});
  const data=await response.json() as Record<string,unknown>;
  if(data.erro===true)return NextResponse.json({error:'CEP não encontrado.'},
   {status:404,headers:noStore});
  const str=(key:string)=>typeof data[key]==='string'?String(data[key]).slice(0,120):'';
  if(!/^[A-Z]{2}$/.test(str('uf')))return NextResponse.json({
   error:'O serviço retornou uma resposta inválida.'
  },{status:502,headers:noStore});
  return NextResponse.json({
   postal_code:cep,street:str('logradouro'),district:str('bairro'),
   city:str('localidade'),state_code:str('uf')
  },{headers:noStore});
 }catch{
  return NextResponse.json({error:'Serviço de consulta de CEP indisponível no momento.'},
   {status:503,headers:noStore});
 }
}
