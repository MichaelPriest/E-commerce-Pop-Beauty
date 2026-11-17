import test from 'node:test';
import assert from 'node:assert/strict';
import {checkoutAmountsMatch,mercadoPagoCheckoutAmounts} from '../src/lib/payments/checkout-amounts.ts';
import {parseCommercialPaymentSnapshot,validatedMpCheckoutUrl} from '../src/lib/payments/mp-payment-snapshot-core.ts';

const items = [{sku:'BATOM-01',title:'Batom',priceCents:1230,quantity:2}];
const checkout = '80000000-0000-4000-8000-000000000007';
const resource = {
  id:23845242342, live_mode:true, external_reference:'pope-order-payment:'+checkout,
  status:'approved', currency_id:'BRL', collector_id:523456789, transaction_amount:'34.54',
  transaction_amount_refunded:0, date_last_updated:'2026-11-17T15:30:15.000-0300',
  date_approved:'2026-11-17T15:30:12.000-0300', payer:{email:'customer@example.test'},
};

test('confere o total com a tarifa de R$ 9,94 e discrimina a entrega na preferência', () => {
  assert.equal(checkoutAmountsMatch(items,994,3454),true);
  assert.equal(checkoutAmountsMatch(items,994,2460),false);
  assert.equal(checkoutAmountsMatch(items,0,2460),true);
  const preference = mercadoPagoCheckoutAmounts(items,994);
  assert.deepEqual(preference.items,[{id:'BATOM-01',title:'Batom',quantity:2,currency_id:'BRL',unit_price:12.30}]);
  assert.deepEqual(preference.shipments,{mode:'not_specified',cost:9.94});
  assert.equal(Object.hasOwn(mercadoPagoCheckoutAmounts(items,0),'shipments'),false);
});

test('rejeita valores fracionários, negativos ou inseguros em centavos', () => {
  assert.equal(checkoutAmountsMatch(items,-1,2459),false);
  assert.equal(checkoutAmountsMatch(items,9.94,2469.94),false);
  assert.equal(checkoutAmountsMatch([{...items[0],priceCents:Number.MAX_SAFE_INTEGER}],0,3454),false);
  assert.equal(checkoutAmountsMatch([],994,994),false);
});

test('converte retorno comercial em centavos exatos e horários normalizados', () => {
  assert.deepEqual(parseCommercialPaymentSnapshot(resource),{
    id:'23845242342',status:'approved',currency:'BRL',collectorId:523456789,amountCents:3454,
    checkoutId:checkout,approvedAt:'2026-11-17T18:30:12.000Z',updatedAt:'2026-11-17T18:30:15.000Z',
    refundedCents:0,
  });
  const partiallyRefunded = parseCommercialPaymentSnapshot({...resource,transaction_amount_refunded:'7.63'});
  assert.equal(partiallyRefunded.refundedCents,763);
});

test('isola TEST, referências alheias e retornos financeiros incompletos', () => {
  assert.equal(parseCommercialPaymentSnapshot({...resource,live_mode:false}),null);
  assert.equal(parseCommercialPaymentSnapshot({...resource,external_reference:'pope-sandbox:'+checkout}),null);
  assert.equal(parseCommercialPaymentSnapshot({...resource,external_reference:checkout}),null);
  assert.throws(() => parseCommercialPaymentSnapshot({...resource,live_mode:undefined}),/pagamento inválida/);
  assert.throws(() => parseCommercialPaymentSnapshot({...resource,date_last_updated:'invalid'}),/conciliação/);
  assert.throws(() => parseCommercialPaymentSnapshot({...resource,transaction_amount_refunded:99}),/conciliação/);
});

test('somente endereços HTTPS do Mercado Pago são apresentados como links comerciais', () => {
  const url = 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=mp123';
  assert.equal(validatedMpCheckoutUrl(url),url);
  for (const unsafe of [
    'http://www.mercadopago.com.br/checkout', 'https://mercadopago.com.br.example.test/',
    'https://mercadopago.com.br@example.test/', 'https://other@example.test/',
    'https://other@mercadopago.com.br/', 'https://mercadopago.com.br:444/',
  ]) assert.equal(validatedMpCheckoutUrl(unsafe),null);
});
