/** Montagem e interpretação estrita de cotações de SANDBOX. Sem compra de frete. */
import type {PreparedVolume} from './shipment-preparation';

export type MelhorEnvioSandboxQuote={
 service_id:string;service:string;carrier:string;price_cents:number;delivery_days:number;
};
export type SandboxQuotePayload={
 from:{postal_code:string};to:{postal_code:string};
 volumes:{height:number;width:number;length:number;weight:number}[];
 options:{receipt:false;own_hand:false};
};
const zip=/^\d{8}$/;
function centimeters(value:number){
 return Number.isFinite(value)&&value>0&&value<=300&&
  Math.abs(Math.round(value*100)-value*100)<1e-8;
}
export function buildOrderSandboxQuote(input:{
 originZip:string;destinationZip:string;volumes:PreparedVolume[];
}):SandboxQuotePayload {
 const {originZip,destinationZip,volumes}=input;
 if(!zip.test(originZip)||!zip.test(destinationZip))
  throw new Error('CEP de origem ou destino inválido.');
 if(volumes.length<1||volumes.length>50)
  throw new Error('A quantidade de volumes deve estar entre 1 e 50.');
 const numbers=new Set<number>();
 const packages=volumes.map(volume=>{
  const {volume_number:n,weight_g:weight,height_cm:height,width_cm:width,length_cm:length}=volume;
  if(!Number.isInteger(n)||n<1||n>50||numbers.has(n))
   throw new Error('Numeração de volumes inválida ou repetida.');
  numbers.add(n);
  if(!Number.isInteger(weight)||weight<1||weight>500000||
     ![height,width,length].every(centimeters))
   throw new Error('Peso ou dimensões inválidos na preparação dos volumes.');
  return {height,width,length,weight:Number((weight/1000).toFixed(3))};
 });
 return {from:{postal_code:originZip},to:{postal_code:destinationZip},
  volumes:packages,options:{receipt:false,own_hand:false}};
}
function moneyToCents(value:unknown):number|null{
 if(typeof value!=='string'&&typeof value!=='number')return null;
 const formatted=String(value);
 if(!/^\d{1,6}(?:\.\d{1,2})?$/.test(formatted))return null;
 const [whole,decimal='']=formatted.split('.');
 const cents=Number(whole)*100+Number(decimal.padEnd(2,'0'));
 return cents>0&&Number.isSafeInteger(cents)?cents:null;
}
export function parseOrderSandboxQuotes(raw:unknown,requestedService:string):MelhorEnvioSandboxQuote[]{
 if(!Array.isArray(raw))throw new Error('Resposta inesperada da sandbox.');
 const found=new Set<string>();
 const normalized:MelhorEnvioSandboxQuote[]=[];
 for(const entry of raw){
  if(!entry||typeof entry!=='object'||Array.isArray(entry))continue;
  const r=entry as Record<string,unknown>;
  if(r.error)continue;
  const id=(typeof r.id==='number'||typeof r.id==='string')?String(r.id):'';
  if(!/^\d{1,8}$/.test(id)||id!==requestedService||found.has(id))continue;
  const price=moneyToCents(r.custom_price??r.price);
  const days=Number(r.custom_delivery_time??r.delivery_time);
  if(price===null||!Number.isInteger(days)||days<0||days>180)continue;
  const company=r.company&&typeof r.company==='object'&&!Array.isArray(r.company)?
   r.company as Record<string,unknown>:null;
  const service=typeof r.name==='string'?r.name.trim().slice(0,80):'';
  const carrier=typeof company?.name==='string'?company.name.trim().slice(0,80):'';
  if(!service||!carrier)continue;
  found.add(id);
  normalized.push({service_id:id,service,carrier,price_cents:price,delivery_days:days});
 }
 return normalized;
}
