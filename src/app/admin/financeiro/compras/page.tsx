import Link from 'next/link';
import {ArrowLeft,Boxes,ClipboardCheck,Coins,ReceiptText} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {brazilTodayISO} from '@/lib/catalog-quality';
import {formatReceiptCost,purchaseOrderNumber,type ReceiptCostReport,type ReceiptCostTotals} from '@/lib/purchase-receiving';
import {dateTimeBR} from '@/types/operations';
import {DownloadReceiptCosts} from './download-receipt-costs';

export const dynamic = 'force-dynamic';
export const metadata = {title:'Custos de recebimento | Popê Beauty'};
const route = '/admin/financeiro/compras';
const numberBR = new Intl.NumberFormat('pt-BR');
const cost = (row: Omit<ReceiptCostTotals,'receipts'>) => row.units > 0 && row.units === row.units_without_cost
 ? '—' : formatReceiptCost(row.cost_cents);

export default async function GoodsReceiptCostPage({searchParams}:{
 searchParams: Promise<{mes?: string}>;
}) {
 const sb = await requireAdmin();
 const {mes} = await searchParams;
 const todayMonth = brazilTodayISO().slice(0,7);
 const month = typeof mes === 'string' && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(mes) ? mes : todayMonth;
 const {data,error} = await sb.rpc('admin_goods_receipt_costs',{p_month:month+'-01'});
 const report = data as ReceiptCostReport | null;
 return <div className="container admin-workspace">
  <div className="admin-top">
   <div><h1><ReceiptText size={27}/> Custos de mercadorias recebidas</h1>
    <p>Entradas contabilizadas no estoque, por mês e fornecedor.</p>
   </div>
   <Link href="/admin/financeiro" className="admin-outline"><ArrowLeft size={17}/> Financeiro</Link>
  </div>
  <form action={route} className="pope-receipt-links pope-cost-filters">
   <label>Mês da entrada <input type="month" name="mes" defaultValue={month}
    className="pope-receipt-input" required/></label>
   <button className="admin-primary">Consultar</button>
   {report && <DownloadReceiptCosts month={month} rows={report.suppliers}/>}
  </form>
  {error || !report ? <p role="alert" className="form-error">
   Falha ao carregar os custos dos recebimentos. {error?.message}</p> : <>
   <div className="admin-metric-row pope-receipt-costs">
    <div><Coins/><small>Custo informado das mercadorias</small><strong>{cost(report.totals)}</strong></div>
    <div><ClipboardCheck/><small>Recebimentos contabilizados</small><strong>{numberBR.format(report.totals.receipts)}</strong></div>
    <div><Boxes/><small>Unidades recebidas</small><strong>{numberBR.format(report.totals.units)}</strong></div>
    <div><ReceiptText/><small>Unidades sem custo informado</small><strong>{numberBR.format(report.totals.units_without_cost)}</strong></div>
   </div>
   <p className="admin-help">O custo soma quantidade recebida × custo unitário informado por lote.
    A data da entrada e a do pagamento ao fornecedor podem ser diferentes.</p>
   <section className="ops-form-card">
    <h2>Resumo por fornecedor</h2>
    {report.suppliers.length ? <div className="ops-table-scroll"><table className="ops-table">
     <thead><tr><th>Fornecedor</th><th>Recebimentos</th><th>Unidades</th><th>Unidades sem custo</th><th>Custo informado</th></tr></thead>
     <tbody>{report.suppliers.map(row => <tr key={row.supplier_id ?? row.supplier_label}>
      <td>{row.supplier_label}</td><td>{numberBR.format(row.receipts)}</td>
      <td>{numberBR.format(row.units)}</td><td>{numberBR.format(row.units_without_cost)}</td>
      <td><strong>{cost(row)}</strong></td>
     </tr>)}</tbody>
    </table></div> : <p className="admin-help">Nenhum recebimento contabilizado neste mês.</p>}
   </section>
   {report.recent.length > 0 && <section className="ops-form-card">
    <h2>Últimos recebimentos do mês</h2>
    <div className="ops-table-scroll"><table className="ops-table">
     <thead><tr><th>Entrada</th><th>Fornecedor / documento</th><th>Pedido de compra</th>
      <th>Unidades</th><th>Unidades sem custo</th><th>Custo informado</th><th>Ação</th></tr></thead>
     <tbody>{report.recent.map(row => <tr key={row.id}>
      <td>{dateTimeBR(row.posted_at)}</td><td>{row.supplier_label}<small>{row.reference || 'Sem referência'}</small></td>
      <td>{row.purchase_order_number === null ? '—' : purchaseOrderNumber(row.purchase_order_number)}</td>
      <td>{numberBR.format(row.units)}</td><td>{numberBR.format(row.units_without_cost)}</td>
      <td>{cost(row)}</td><td><Link href={'/admin/estoque/recebimento?recebimento='+row.id+'#historico-da-entrega'}
       className="ops-small">Ver conferência</Link></td>
     </tr>)}</tbody>
    </table></div>
   </section>}
  </>}
 </div>;
}
