import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkoutDeliveryItems,deliveryDeadline} from '../src/lib/checkout-delivery.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const line={
 product_id:'product-1',variant_id:'variant-1',quantity:2,
 unit_price_cents:1230,line_total_cents:2460,status:'ready'
};

test('confirmação leva a variação resolvida e o preço exibido de cada item',()=>{
 assert.deepEqual(checkoutDeliveryItems([line]),[{
  product_id:'product-1',variant_id:'variant-1',quantity:2,unit_price_cents:1230
 }]);
 for(const invalid of [
  {...line,status:'out_of_stock'},{...line,variant_id:null},{...line,unit_price_cents:null}
 ]){
  assert.throws(()=>checkoutDeliveryItems([invalid]),/variações e os preços/);
 }
 assert.equal(deliveryDeadline(0),'Entrega no mesmo dia');
 assert.equal(deliveryDeadline(1),'Até 1 dia útil');
 assert.equal(deliveryDeadline(3),'Até 3 dias úteis');
});

test('frete homologado reusa a transação de reserva e revalida preço e prazo',()=>{
 const sql=read('supabase/checkout_delivery_rates_v1.sql');
 assert.match(sql,/if v_user is null or not private\.is_admin\(\)/);
 assert.match(sql,/v_address\.updated_at is distinct from p_address_version/);
 assert.match(sql,/v_rate\.revision is distinct from p_rate_revision/);
 assert.match(sql,/p_address_id,p_items,p_request_key\)/);
 assert.match(sql,/expected\.unit_price_cents is distinct from oi\.unit_price_cents/);
 assert.match(sql,/o\.total_cents::bigint\+v_rate\.price_cents/);
 assert.match(sql,/v_order\.checkout_delivery_snapshot->>'request_hash' is distinct from v_item_hash/);
 assert.match(read('src/app/checkout/preview-page.tsx'),/isAdmin&&addressId&&allReady&&quote&&!testOrder/);
});
