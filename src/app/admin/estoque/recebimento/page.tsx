import Link from 'next/link';
import {ArrowLeft,Truck} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {GoodsReceiptManager} from './goods-receipt-manager';
export const dynamic='force-dynamic';
export const metadata={title:'Recebimento de mercadorias | Popê Beauty'};

export default async function GoodsReceiptPage(){
 const sb=await requireAdmin();
 const [suppliers,variants,receipts]=await Promise.all([
  sb.from('suppliers').select('id,name,tax_id,active').order('name').limit(300),
  sb.from('variants').select('id,sku,ean,name,shade,active,products(id,name,active,is_adult),inventory(on_hand,reserved)')
   .order('sku').limit(1000),
  sb.from('goods_receipts')
   .select('id,supplier_id,supplier_label,reference,document_date,notes,status,created_at,posted_at,goods_receipt_items(id,variant_id,sku_snapshot,product_snapshot,lot_code,expires_at,quantity,unit_cost_cents)')
   .order('created_at',{ascending:false}).limit(50)
 ]);
 const fail=[suppliers.error,variants.error,receipts.error].find(Boolean);
 if(fail)return <div className="container admin-workspace">
  <h1>Recebimento de mercadorias</h1><p role="alert" className="form-error">
   Falha ao carregar a conferência: {fail.message}</p></div>;
 return <div className="container admin-workspace pope-goods-receipt">
  <div className="admin-top">
   <div><div className="section-kicker">POPÊ BEAUTY • ALMOXARIFADO</div>
    <h1><Truck size={27}/> Recebimento de mercadorias</h1>
    <p>Leia SKU/EAN, confira fornecedor, lote e validade e contabilize uma única vez.</p>
   </div>
   <div className="admin-form-footer">
    <Link href="/admin/fornecedores" className="admin-outline">
     Fornecedores</Link>
    <Link href="/admin/estoque" className="admin-outline">
     <ArrowLeft size={16}/> Estoque</Link>
   </div>
  </div>
  <GoodsReceiptManager suppliers={suppliers.data??[]}
   variants={(variants.data??[]) as any}
   receipts={(receipts.data??[]) as any}/>
 </div>;
}
