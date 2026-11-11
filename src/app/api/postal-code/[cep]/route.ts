import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';

export const dynamic='force-dynamic';
export const runtime='nodejs';

type CepAddress={
 postal_code:string;street:string;district:string;city:string;
 state_code:string;source:'ViaCEP'|'BrasilAPI';
};
const noStore={'Cache-Control':'private, no-store, max-age=0'};
const safeText=(value:unknown,max=120)=>typeof value==='string'?
 value.trim().slice(0,max):'';
const validUf=(uf:string)=>/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(uf);
async function viaCep(cep:string):Promise<CepAddress|null>{
 const response=await fetch('https://viacep.com.br/ws/'+cep+'/json/',{
  method:'GET',cache:'no-store',redirect:'error',
  signal:AbortSignal.timeout(5200),headers:{Accept:'application/json'}
 });
 if(!response.ok)throw new Error('ViaCEP indisponível');
 const data=await response.json() as Record<string,unknown>;
 if(data.erro===true)return null;
 const state_code=safeText(data.uf,2).toUpperCase();
 const city=safeText(data.localidade,80);
 if(!validUf(state_code)||!city)throw new Error('ViaCEP retornou endereço incompleto');
 return {
  postal_code:cep,street:safeText(data.logradouro),
  district:safeText(data.bairro,80),city,state_code,source:'ViaCEP'
 };
}
async function brasilApi(cep:string):Promise<CepAddress|null>{
 const response=await fetch('https://brasilapi.com.br/api/cep/v1/'+cep,{
  method:'GET',cache:'no-store',redirect:'error',
  signal:AbortSignal.timeout(5200),headers:{Accept:'application/json'}
 });
 if(response.status===404)return null;
 if(!response.ok)throw new Error('BrasilAPI indisponível');
 const data=await response.json() as Record<string,unknown>;
 const state_code=safeText(data.state,2).toUpperCase();
 const city=safeText(data.city,80);
 if(!validUf(state_code)||!city)throw new Error('BrasilAPI retornou endereço incompleto');
 return {
  postal_code:cep,street:safeText(data.street),
  district:safeText(data.neighborhood,80),
  city,state_code,source:'BrasilAPI'
 };
}
export async function GET(_request:NextRequest,{params}:{params:Promise<{cep:string}>}){
 const sb=await createClient();
 const {data:auth,error}=await sb.auth.getClaims();
 if(error||!auth?.claims?.sub){
  return NextResponse.json({error:'Entre na sua conta para consultar o CEP.'},
   {status:401,headers:noStore});
 }
 const {cep}=await params;
 if(!/^[0-9]{8}$/.test(cep)){
  return NextResponse.json({error:'Digite um CEP de 8 números.'},
   {status:400,headers:noStore});
 }
 let notFound=0;
 for(const lookup of [viaCep,brasilApi]){
  try{
   const address=await lookup(cep);
   if(address)return NextResponse.json(address,{headers:noStore});
   notFound++;
  }catch{/* tenta o outro provedor sem expor erro remoto */}
 }
 if(notFound===2)return NextResponse.json({error:'CEP não encontrado. Confira os números informados.'},
  {status:404,headers:noStore});
 return NextResponse.json({error:'Os serviços de CEP não responderam. Digite o endereço manualmente ou tente novamente.'},
  {status:503,headers:noStore});
}
