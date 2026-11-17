import Link from 'next/link';
import {ArrowLeft,Truck} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {openForReceipt,purchaseOrderFields,type PurchaseOrder} from '@/lib/purchase-receiving';
import type {StockVariant} from '@/lib/stock-variant-lookup';
import {GoodsReceiptManager,type StoredReceipt} from './goods-receipt-manager';
export const dynamic='force-dynamic';
export const metadata={title:'Recebimento de mercadorias | Popê Beauty'};

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const receiptFields = 'id,supplier_id,supplier_label,reference,document_date,notes,status,created_at,posted_at,purchase_order_id,draft_token,invoice_reference,invoice_lines,invoice_warnings,invoice_review_reason,purchase_orders(number),goods_receipt_items(id,variant_id,sku_snapshot,product_snapshot,lot_code,expires_at,quantity,unit_cost_cents)';

export default async function GoodsReceiptPage({searchParams}:{
 searchParams: Promise<{pedido?: string; recebimento?: string}>;
}) {
 const sb=await requireAdmin();
 const {pedido,recebimento}=await searchParams;
 const orderId=typeof pedido==='string'&&uuid.test(pedido) ? pedido : null;
 const receiptId=typeof recebimento==='string'&&uuid.test(recebimento) ? recebimento : null;
 const [suppliers,variants,receipts,openOrders,requestedOrder,requestedReceipt]=await Promise.all([
  sb.from('suppliers').select('id,name,tax_id,active').order('name').limit(1000),
  sb.from('variants').select('id,sku,ean,name,shade,active,products(id,name,active)')
   .order('sku').limit(1000),
  sb.from('goods_receipts').select(receiptFields).order('created_at',{ascending:false}).limit(50),
  sb.from('purchase_orders').select(purchaseOrderFields,{count:'exact'})
   .in('status',['open','partial']).order('number',{ascending:false}).limit(100),
  orderId ? sb.from('purchase_orders').select(purchaseOrderFields).eq('id',orderId).maybeSingle() : null,
  receiptId ? sb.from('goods_receipts').select(receiptFields).eq('id',receiptId).maybeSingle() : null
 ]);
 const fail=[suppliers.error,variants.error,receipts.error,openOrders.error,requestedOrder?.error,requestedReceipt?.error].find(Boolean);
 if(fail)return <div className="container admin-workspace">
  <h1>Recebimento de mercadorias</h1><p role="alert" className="form-error">
   Falha ao carregar a conferência: {fail.message}</p></div>;

 const history=(receipts.data??[]) as unknown as StoredReceipt[];
 const receipt= requestedReceipt?.data as unknown as StoredReceipt | null;
 const displayedReceipts=receipt && !history.some(item=>item.id===receipt.id) ? [receipt,...history] : history;
 const active=(openOrders.data??[]) as unknown as PurchaseOrder[];
 const requested=requestedOrder?.data as unknown as PurchaseOrder | null;
 const selected=requested && openForReceipt(requested.status) ? requested : null;
 const purchaseOrders=selected && !active.some(item=>item.id===selected.id) ? [selected,...active] : active;
 const known=new Set(purchaseOrders.map(item=>item.id));
 const missing=Array.from(new Set(displayedReceipts.flatMap(item=>
  item.status==='draft'&&item.purchase_order_id&&!known.has(item.purchase_order_id) ? [item.purchase_order_id] : []
 )));
 if(missing.length){
  const linked=await sb.from('purchase_orders').select(purchaseOrderFields)
   .in('id',missing).in('status',['open','partial']);
  if(linked.error)throw new Error('Não foi possível carregar os pedidos vinculados aos rascunhos.');
  purchaseOrders.push(...((linked.data??[]) as unknown as PurchaseOrder[]));
 }
 return <div className="container admin-workspace pope-goods-receipt">
  <div className="admin-top">
   <div><h1><Truck size={27}/> Recebimento de mercadorias</h1>
    <p>Confira SKU, quantidades, lotes e validade antes de contabilizar a entrega.</p>
   </div>
   <div className="pope-receipt-links">
    <Link href="/admin/estoque/compras" className="admin-outline">Pedidos de compra</Link>
    <Link href="/admin/fornecedores" className="admin-outline">Fornecedores</Link>
    <Link href="/admin/estoque" className="admin-outline"><ArrowLeft size={16}/> Estoque</Link>
   </div>
  </div>
  {orderId && !selected && <p role="alert" className="form-error">O pedido indicado não está aberto para receber mercadoria.</p>}
  {receiptId && !receipt && <p role="alert" className="form-error">Recebimento não encontrado.</p>}
  <GoodsReceiptManager key={orderId??receiptId??'recebimento'} suppliers={suppliers.data??[]}
   variants={(variants.data??[]) as unknown as StockVariant[]} receipts={displayedReceipts}
   purchaseOrders={purchaseOrders} initialOrder={selected} initialReceiptId={receipt?.id}
   moreOrders={(openOrders.count??0)>100}/>
 </div>;
}
