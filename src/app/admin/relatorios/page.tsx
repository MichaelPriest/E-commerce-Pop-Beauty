import Link from 'next/link';
import {BarChart3,ReceiptText,Clock,PackageCheck,Boxes,AlertTriangle} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {formatBRL} from '@/lib/products';
import {ReportsView} from './reports-view';
export const dynamic='force-dynamic';

export type MonthMetric={
 month_key:string;order_count:number;registered_cents:number;
 confirmed_cents:number;pending_cents:number;cancelled_count:number;
};
export type StockAlert={
 product_name:string;sku:string;available:number;min_stock:number;
 expired_lots:number;expiring_lots:number;
};
export default async function ReportsPage(){
 const sb=await requireAdmin();
 const [metrics,alerts]=await Promise.all([
  sb.rpc('admin_monthly_metrics',{p_months:12}),
  sb.rpc('admin_stock_alerts',{p_limit:100})
 ]);
 if(metrics.error||alerts.error)return <div className="container admin-workspace">
  <h1>Relatórios</h1><p className="form-error" role="alert">{metrics.error?.message||alerts.error?.message}</p></div>;
 const months=(metrics.data??[]).map((x:any)=>({
  month_key:String(x.month_key),order_count:Number(x.order_count),
  registered_cents:Number(x.registered_cents),confirmed_cents:Number(x.confirmed_cents),
  pending_cents:Number(x.pending_cents),cancelled_count:Number(x.cancelled_count)
 })) as MonthMetric[];
 const stock=(alerts.data??[]).map((x:any)=>({
  product_name:String(x.product_name),sku:String(x.sku),
  available:Number(x.available),min_stock:Number(x.min_stock),
  expired_lots:Number(x.expired_lots),expiring_lots:Number(x.expiring_lots)
 })) as StockAlert[];
 const totals=months.reduce((a,m)=>({
  orders:a.orders+m.order_count,
  registered:a.registered+m.registered_cents,
  confirmed:a.confirmed+m.confirmed_cents,
  pending:a.pending+m.pending_cents
 }),{orders:0,registered:0,confirmed:0,pending:0});
 return <div className="container admin-workspace">
  <div className="admin-top">
   <div><div className="section-kicker">ANÁLISE OPERACIONAL • POPÊ BEAUTY</div>
    <h1><BarChart3 size={30}/> Relatórios da loja</h1>
    <p>Evolução mensal dos pedidos e alertas de estoque, com dados do Supabase.</p></div>
   <Link href="/admin/financeiro" className="admin-outline"><ReceiptText size={17}/> Financeiro</Link>
  </div>
  <div className="admin-metric-row">
   <div><ReceiptText/><small>Pedidos nos últimos 12 meses</small><strong>{totals.orders}</strong></div>
   <div><BarChart3/><small>Valor de pedidos não cancelados</small><strong>{formatBRL(totals.registered)}</strong></div>
   <div><PackageCheck/><small>Valores com confirmação administrativa*</small><strong>{formatBRL(totals.confirmed)}</strong></div>
   <div><Clock/><small>Pedidos aguardando pagamento</small><strong>{formatBRL(totals.pending)}</strong></div>
  </div>
  <p className="ops-info"><AlertTriangle size={19}/> *Os valores são classificados pelo status atual de cada pedido e agrupados pelo mês de criação. Não representam depósitos confirmados pelo banco, faturamento fiscal ou data efetiva do recebimento. Pedidos cancelados e reembolsados não entram no valor de pedidos não cancelados.</p>
  <ReportsView months={months} stock={stock}/>
 </div>;
}
