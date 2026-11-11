import 'server-only';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';

/** A URL do MP fornece data.id, a assinatura vem em x-signature e x-request-id. */
export function verifyMpWebhookSignature(input:{
 signature:string|null;requestId:string|null;dataId:string|null;secret:string;
 now?:number;
}):boolean{
 const {signature,requestId,dataId,secret}=input;
 if(!signature||signature.length>250||!requestId||requestId.length>160||
  !dataId||dataId.length>80||!secret)return false;
 if(!/^[A-Za-z0-9_-]+$/.test(dataId)||
  !/^[A-Za-z0-9._:-]+$/.test(requestId))return false;
 const pairs=signature.split(',').map(x=>x.trim());
 if(pairs.length!==2)return false;
 const tsEntries=pairs.filter(x=>x.startsWith('ts='));
 const sigEntries=pairs.filter(x=>x.startsWith('v1='));
 if(tsEntries.length!==1||sigEntries.length!==1)return false;
 const ts=tsEntries[0].slice(3);
 const supplied=sigEntries[0].slice(3);
 if(!/^\d{10,13}$/.test(ts)||!/^[a-f0-9]{64}$/i.test(supplied))return false;
 const signedAt=Number(ts)/(ts.length>=13?1000:1);
 const now=input.now??Date.now();
 if(!Number.isFinite(signedAt)||Math.abs(now-signedAt*1000)>300000)return false;
 const canonical='id:'+dataId.toLowerCase()+';request-id:'+requestId+';ts:'+ts+';';
 const expected=createHmac('sha256',secret).update(canonical,'utf8').digest();
 const received=Buffer.from(supplied,'hex');
 return received.length===expected.length&&timingSafeEqual(expected,received);
}

export function webhookPayloadSha256(payload:string){
 return createHash('sha256').update(payload,'utf8').digest('hex');
}
