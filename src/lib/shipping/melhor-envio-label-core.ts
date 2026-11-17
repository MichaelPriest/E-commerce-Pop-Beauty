export function melhorEnvioLabelStatus(record:Record<string,unknown>){
 const status=String(record.status??'').toLowerCase();
 if(['canceled','cancelled'].includes(status)||record.canceled_at)return 'cancelled';
 if(status==='delivered'||record.delivered_at)return 'delivered';
 if(['posted','undelivered','not delivered'].includes(status)||record.posted_at)return 'posted';
 if(status==='generated'||record.generated_at)return 'generated';
 if(['released','paid'].includes(status)||record.paid_at)return 'paid';
 if(status==='pending')return 'cart_ready';
 return null;
}

export function melhorEnvioPrintLink(value:unknown,environment:'sandbox'|'producao'){
 if(typeof value!=='string'||value.length>2000)return null;
 try{
  const url=new URL(value);
  const hosts=environment==='sandbox'?['sandbox.melhorenvio.com.br']:['melhorenvio.com.br','www.melhorenvio.com.br'];
  return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&hosts.includes(url.hostname)?url.href:null;
 }catch{return null;}
}

export function filterLabelQuotes(value:unknown,volumeCount:number){
 if(!Array.isArray(value))return [];
 return value.flatMap(q=>{
  if(!q||q.error||!Number.isSafeInteger(Number(q.id))||Number(q.id)<1)return [];
  const carrier=String(q.company?.name??'').trim();
  if(!carrier||/azul/i.test(carrier)||volumeCount>1&&/correios|j\s*&\s*t|loggi/i.test(carrier))return [];
  const price=String(q.price??q.custom_price??'');
  if(!/^\d{1,6}(\.\d{1,2})?$/.test(price)||Number(price)<=0)return [];
  return [{id:Number(q.id),name:String(q.name??'').slice(0,80),carrier:carrier.slice(0,80),costCents:Math.round(Number(price)*100)}];
 }).sort((a,b)=>a.costCents-b.costCents);
}
