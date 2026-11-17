export const purchaseOrderStates = {
 draft: 'Rascunho',
 open: 'Aguardando entrega',
 partial: 'Recebido parcialmente',
 received: 'Recebido por completo',
 closed: 'Encerrado com saldo',
 cancelled: 'Cancelado'
} as const;

export type PurchaseOrderStatus = keyof typeof purchaseOrderStates;
export type PurchaseOrderLine = {
 variant_id: string;
 sku_snapshot: string;
 product_snapshot: string;
 quantity: number;
 received_quantity: number;
 unit_cost_cents: number | null;
};
export type PurchaseOrder = {
 id: string;
 number: number;
 supplier_id: string;
 supplier_label: string;
 status: PurchaseOrderStatus;
 expected_on: string | null;
 notes: string;
 closure_reason: string;
 updated_at: string;
 purchase_order_items: PurchaseOrderLine[];
};

export const purchaseOrderFields = [
 'id,number,supplier_id,supplier_label,status,expected_on,notes,closure_reason,updated_at',
 'purchase_order_items(variant_id,sku_snapshot,product_snapshot,quantity,received_quantity,unit_cost_cents)'
].join(',');

export function purchaseOrderNumber(value: number) {
 return 'PC-' + String(value).padStart(5, '0');
}

export function openForReceipt(status: PurchaseOrderStatus) {
 return status === 'open' || status === 'partial';
}

export type InvoiceLine = {
 variant_id: string;
 sku: string;
 product: string;
 quantity: number;
};
export type ReceiptInvoice = {
 reference: string;
 lines: InvoiceLine[];
 warnings: string[];
 review_reason: string;
};
type ConferenceLine = {
 id: string;
 sku: string;
 product: string;
 orderBalance: number | null;
 declared: number | null;
 physical: number;
};

export function compareReceipt(
 physical: Array<Omit<InvoiceLine, 'quantity'> & {quantity: string | number}>,
 invoice: ReceiptInvoice | null,
 orderLines: PurchaseOrderLine[] | null
) {
 const rows = new Map<string, ConferenceLine>();
 function getLine(id: string, sku: string, product: string) {
  const current = rows.get(id);
  if (current) return current;
  const row = {id, sku, product, orderBalance: orderLines ? 0 : null,
   declared: invoice ? 0 : null, physical: 0};
  rows.set(id,row);
  return row;
 }
 for (const item of orderLines ?? []) {
  const balance = item.quantity - item.received_quantity;
  if (balance > 0) getLine(item.variant_id,item.sku_snapshot,item.product_snapshot).orderBalance = balance;
 }
 for (const item of invoice?.lines ?? []) {
  getLine(item.variant_id,item.sku,item.product).declared = item.quantity;
 }
 for (const item of physical) {
  const quantity = Number(item.quantity);
  const row = getLine(item.variant_id,item.sku,item.product);
  if (Number.isSafeInteger(quantity) && quantity > 0) row.physical += quantity;
 }
 return Array.from(rows.values(), row => ({
  ...row,
  exceedsOrder: row.orderBalance !== null && row.physical > row.orderBalance,
  invoiceDifference: row.declared === null ? null : row.physical - row.declared
 })).sort((a,b) => a.sku.localeCompare(b.sku,'pt-BR'));
}

export type ReceiptCostTotals = {
 receipts: number;
 units: number;
 units_without_cost: number;
 cost_cents: string;
};
export type ReceiptCostReport = {
 totals: ReceiptCostTotals;
 suppliers: Array<ReceiptCostTotals & {supplier_id: string | null; supplier_label: string}>;
 recent: Array<Omit<ReceiptCostTotals,'receipts'> & {
  id: string; supplier_label: string; reference: string; posted_at: string; purchase_order_number: number | null;
 }>;
};

export function receiptCostInReais(cents: string) {
 const value = cents.padStart(3,'0');
 return value.slice(0,-2) + ',' + value.slice(-2);
}

export function formatReceiptCost(cents: string) {
 const [amount,fraction] = receiptCostInReais(cents).split(',');
 return 'R$ ' + BigInt(amount).toLocaleString('pt-BR') + ',' + fraction;
}

export function dateOnlyBR(value: string | null) {
 return value ? value.split('-').reverse().join('/') : '—';
}
