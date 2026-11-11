import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,createHash} from 'node:crypto';
import {verifyMpWebhookSignature,webhookPayloadSha256}
 from '../src/lib/payments/mp-webhook-signature-core.ts';

const SECRET='fake-test-secret-never-use-in-production';
const REQUEST_ID='6f3bd1bc-22de-4e17-85d5-3312cd428a25';
const DATA_ID='12345678901234';
const NOW=1783861200000;

function sign({
 dataId=DATA_ID,requestId=REQUEST_ID,ts=String(Math.floor(NOW/1000)),
 secret=SECRET
}={}){
 const payload='id:'+dataId.toLowerCase()+';request-id:'+requestId+';ts:'+ts+';';
 const hmac=createHmac('sha256',secret).update(payload,'utf8').digest('hex');
 return {signature:'ts='+ts+',v1='+hmac,requestId,dataId,secret,now:NOW};
}

test('aceita assinatura HMAC-SHA256 autêntica com timestamp em segundos',()=>{
 assert.equal(verifyMpWebhookSignature(sign()),true);
});
test('aceita timestamp em milissegundos e ordem invertida dos componentes',()=>{
 const signed=sign({ts:String(NOW)});
 signed.signature=signed.signature.split(',').reverse().join(',');
 assert.equal(verifyMpWebhookSignature(signed),true);
});
test('normaliza apenas o data.id para minúsculas na assinatura',()=>{
 const signed=sign({dataId:'ABC-456'});
 assert.equal(verifyMpWebhookSignature({...signed,dataId:'abc-456'}),true);
});
test('rejeita ID, request-id e segredo adulterados',()=>{
 const signed=sign();
 assert.equal(verifyMpWebhookSignature({...signed,dataId:'12345678901235'}),false);
 assert.equal(verifyMpWebhookSignature({...signed,requestId:'other-request'}),false);
 assert.equal(verifyMpWebhookSignature({...signed,secret:'other-secret'}),false);
});
test('rejeita assinatura antiga ou adiantada além de cinco minutos',()=>{
 assert.equal(verifyMpWebhookSignature(sign({ts:String(NOW/1000-301)})),false);
 assert.equal(verifyMpWebhookSignature(sign({ts:String(NOW/1000+301)})),false);
});
test('aceita os dois limites da tolerância de cinco minutos',()=>{
 assert.equal(verifyMpWebhookSignature(sign({ts:String(NOW/1000-300)})),true);
 assert.equal(verifyMpWebhookSignature(sign({ts:String(NOW/1000+300)})),true);
});
test('rejeita assinatura ausente, duplicada, inválida ou ts malformado',()=>{
 const signed=sign();
 assert.equal(verifyMpWebhookSignature({...signed,signature:null}),false);
 assert.equal(verifyMpWebhookSignature({...signed,signature:signed.signature+',ts=1'}),false);
 assert.equal(verifyMpWebhookSignature({...signed,signature:signed.signature.replace('v1=','v2=')}),false);
 assert.equal(verifyMpWebhookSignature(sign({ts:'123456789012'})),false);
 assert.equal(verifyMpWebhookSignature({...signed,requestId:'bad;request'}),false);
});
test('hash SHA-256 do corpo é determinístico e difere após alteração',()=>{
 const raw='{"type":"payment","id":1234}';
 assert.equal(webhookPayloadSha256(raw),createHash('sha256').update(raw).digest('hex'));
 assert.notEqual(webhookPayloadSha256(raw),webhookPayloadSha256(raw+' '));
});
