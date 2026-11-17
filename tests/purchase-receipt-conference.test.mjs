import test from 'node:test';
import assert from 'node:assert/strict';
import {compareReceipt,formatReceiptCost,receiptCostInReais} from '../src/lib/purchase-receiving.ts';

const purchase = (id,quantity,received_quantity) => ({
 variant_id:id,sku_snapshot:id,product_snapshot:id,quantity,received_quantity,unit_cost_cents:null
});
const item = (id,quantity) => ({variant_id:id,sku:id,product:id,quantity});
const declared = lines => ({reference:'NF-e 109/1',lines,warnings:[],review_reason:''});

test('conferência agrega lotes e preserva quantidades declaradas e saldo do pedido', () => {
 const invoice = declared([item('A',6),item('B',2)]);
 const rows = compareReceipt([item('A','3'),item('A','2')],invoice,
  [purchase('A',10,4),purchase('C',2,0)]);
 assert.deepEqual(rows.map(row => [row.sku,row.orderBalance,row.declared,row.physical,row.invoiceDifference]), [
  ['A',6,6,5,-1],['B',0,2,0,-2],['C',2,0,0,0]
 ]);
 assert.equal(rows.some(row => row.exceedsOrder),false);
 assert.equal(invoice.lines[0].quantity,6);
});

test('detecta excesso somado por lote e SKU fora do pedido sem exigir NF-e', () => {
 const order = [purchase('A',10,8)];
 const physical = [item('A',1),item('A',2),item('B',1)];
 const linked = compareReceipt(physical,null,order);
 assert.deepEqual(linked.map(row => row.exceedsOrder),[true,true]);
 assert.deepEqual(linked.map(row => row.invoiceDifference),[null,null]);
 assert.equal(compareReceipt(physical,null,null).some(row => row.exceedsOrder),false);
});

test('formatação financeira preserva centavos para zero e totais grandes', () => {
 assert.equal(formatReceiptCost('0'),'R$ 0,00');
 assert.equal(receiptCostInReais('3'),'0,03');
 assert.equal(formatReceiptCost('900719925474099233'),'R$ 9.007.199.254.740.992,33');
});
