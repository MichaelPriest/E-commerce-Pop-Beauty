import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePaymentSnapshot}
 from '../src/lib/payments/mp-payment-snapshot-core.ts';

const ATTEMPT='e815f0a1-0000-4000-8000-000000000004';
const payment={
 id:1234567890,status:'approved',transaction_amount:37.8,
 currency_id:'BRL',collector_id:123456789,live_mode:false,
 external_reference:'pope-sandbox:'+ATTEMPT,
 metadata:{pope_environment:'sandbox',pope_attempt_id:ATTEMPT}
};

test('converte resposta oficial em snapshot financeiro sanitizado',()=>{
 const p=parsePaymentSnapshot(payment);
 assert.deepEqual(p,{
  id:'1234567890',status:'approved',amountCents:3780,
  currency:'BRL',collectorId:123456789,liveMode:false,
  attemptId:ATTEMPT,metadataAttemptId:ATTEMPT
 });
});
test('extrai valores decimais exatos em centavos e status pending/rejected',()=>{
 const pending=parsePaymentSnapshot({...payment,status:'pending',
  transaction_amount:'1.05'});
 const rejected=parsePaymentSnapshot({...payment,status:'rejected',
  transaction_amount:'10.00'});
 assert.equal(pending?.amountCents,105);
 assert.equal(rejected?.amountCents,1000);
});
test('rejeita respostas incompletas e valores inválidos',()=>{
 assert.equal(parsePaymentSnapshot(null),null);
 assert.equal(parsePaymentSnapshot([]),null);
 assert.equal(parsePaymentSnapshot({...payment,id:'bad-id'}),null);
 assert.equal(parsePaymentSnapshot({...payment,collector_id:'not-a-number'}),null);
 assert.equal(parsePaymentSnapshot({...payment,transaction_amount:'9.999'}),null);
 assert.equal(parsePaymentSnapshot({...payment,live_mode:undefined}),null);
});
test('não assume que live_mode=true ou referência externa equivale a pedido TEST',()=>{
 const live=parsePaymentSnapshot({...payment,live_mode:true});
 assert.equal(live?.liveMode,true);
 const invalid=parsePaymentSnapshot({...payment,external_reference:'other-system-order-1'});
 assert.equal(invalid?.attemptId,null);
});
test('detecta tentativa quando metadata do provedor não corresponde à referência',()=>{
 const conflicting=parsePaymentSnapshot({...payment,
  metadata:{pope_attempt_id:'11111111-1111-4111-8111-111111111111'}});
 assert.equal(conflicting?.attemptId,ATTEMPT);
 assert.notEqual(conflicting?.metadataAttemptId,conflicting?.attemptId);
});
test('snapshot não inclui dados de cartão nem comprador',()=>{
 const extended={...payment,payer:{email:'private@example.invalid'},
  card:{cardholder:{name:'Some User'},last_four_digits:'1234'}};
 const snapshot=parsePaymentSnapshot(extended);
 assert.equal(snapshot!==null,true);
 assert.equal(Object.hasOwn(snapshot,'payer'),false);
 assert.equal(Object.hasOwn(snapshot,'card'),false);
});
