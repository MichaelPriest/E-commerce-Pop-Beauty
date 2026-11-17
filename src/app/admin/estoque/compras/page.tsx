import Link from 'next/link';
import {ClipboardList} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {purchaseOrderFields, purchaseOrderStates, type PurchaseOrder, type PurchaseOrderStatus} from '@/lib/purchase-receiving';
import {PurchaseOrderManager} from './purchase-order-manager';

export const dynamic = 'force-dynamic';
export const metadata = {title:'Pedidos de compra | Popê Beauty'};
const pageSize = 30;
const route = '/admin/estoque/compras';

export default async function PurchaseOrdersPage({searchParams}:{
 searchParams: Promise<{situacao?: string; pagina?: string; sku?: string; quantidade?: string}>;
}) {
 const sb = await requireAdmin();
 const params = await searchParams;
 const status = typeof params.situacao === 'string' && Object.hasOwn(purchaseOrderStates,params.situacao)
  ? params.situacao as PurchaseOrderStatus : '';
 const page = /^\d{1,6}$/.test(params.pagina ?? '') ? Math.max(1,Number(params.pagina)) : 1;
 const offset = (page - 1) * pageSize;
 let query = sb.from('purchase_orders').select(purchaseOrderFields,{count:'exact'})
  .order('number',{ascending:false}).range(offset,offset + pageSize - 1);
 if (status) query = query.eq('status',status);
 const [orders,suppliers] = await Promise.all([
  query,
  sb.from('suppliers').select('id,name').eq('active',true).order('name').limit(1000)
 ]);
 const error = orders.error ?? suppliers.error;
 const href = (number: number) => route + '?' + new URLSearchParams({
  pagina: String(number), ...(status ? {situacao:status} : {})
 });
 return <div className="container admin-workspace">
  <div className="admin-top">
   <div><h1><ClipboardList size={27}/> Pedidos de compra</h1>
    <p>Solicitações por fornecedor, prazos de entrega e saldo a receber.</p>
   </div>
   <div className="pope-receipt-links">
    <Link href="/admin/estoque/reposicao" className="admin-outline">Planejar reposição</Link>
    <Link href="/admin/estoque/recebimento" className="admin-outline">Receber mercadorias</Link>
   </div>
  </div>
  {error ? <p role="alert" className="form-error">Falha ao carregar pedidos de compra. {error.message}</p> : <>
   <PurchaseOrderManager
    orders={(orders.data ?? []) as unknown as PurchaseOrder[]}
    suppliers={suppliers.data ?? []} statusFilter={status}
    suggestedSku={typeof params.sku === 'string' ? params.sku.slice(0,80) : ''}
    suggestedQuantity={/^\d{1,6}$/.test(params.quantidade ?? '')
     ? Math.min(Number(params.quantidade),100000) || 1 : 1}
   />
   <nav aria-label="Páginas de pedidos de compra" className="pope-receipt-links">
    {page > 1 && <Link href={href(page - 1)} className="admin-outline">Página anterior</Link>}
    {(orders.count ?? 0) > offset + pageSize && <Link href={href(page + 1)} className="admin-outline">Próxima página</Link>}
   </nav>
  </>}
 </div>;
}
