'use client';
import {useMemo,useState} from 'react';
import Link from 'next/link';
import {BarChart3,Download,Boxes,AlertTriangle,CalendarDays,FileSpreadsheet} from 'lucide-react';
import {formatBRL} from '@/lib/products';
import type {MonthMetric,StockAlert} from './page';
type Metric='order_count'|'registered_cents'|'confirmed_cents';
const labels:Record<Metric,string>={
 order_count:'Quantidade de pedidos',
 registered_cents:'Valor dos pedidos',
 confirmed_cents:'Valor dos pedidos confirmados manualmente'
};
const monthLabel=(key:string)=>{
 const [y,m]=key.split('-').map(Number);
 return new Date(Date.UTC(y,m-1,10)).toLocaleDateString('pt-BR',{month:'short',year:'2-digit',timeZone:'UTC'});
};
export function ReportsView({months,stock}:{months:MonthMetric[];stock:StockAlert[]}){
 const [period,setPeriod]=useState(6),[metric,setMetric]=useState<Metric>('order_count');
 const filled=useMemo(()=>{
  const byMonth=new Map(months.map(m=>[m.month_key,m]));
  const today=new Date();
  const entries:MonthMetric[]=[];
  for(let i=11;i>=0;i--){
   const d=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth()-i,1));
   const key=d.toISOString().slice(0,7);
   entries.push(byMonth.get(key)??{
    month_key:key,order_count:0,registered_cents:0,
    confirmed_cents:0,pending_cents:0,cancelled_count:0
   });
  }
  return entries;
 },[months]);
 const selected=filled.slice(-period);
 const max=Math.max(1,...selected.map(m=>m[metric]));
 function csvExport(){
  const columns=['Competência','Pedidos','Valor dos pedidos (R$)','Valor confirmado manualmente (R$)','Pendente (R$)','Cancelados'];
  const data=filled.map(m=>[
   m.month_key,String(m.order_count),(m.registered_cents/100).toFixed(2).replace('.',','),
   (m.confirmed_cents/100).toFixed(2).replace('.',','),
   (m.pending_cents/100).toFixed(2).replace('.',','),String(m.cancelled_count)
  ]);
  const text=[columns,...data].map(row=>row.map(v=>'"'+v.replace(/"/g,'""')+'"').join(';')).join('\r\n');
  const file=new Blob(['\ufeff',text],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(file);
  const a=document.createElement('a');
  a.href=url;a.download='pope-beauty-relatorio-mensal.csv';a.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),500);
 }
 return <>
  <section className="pope-report-card">
   <div className="pope-report-heading">
    <div><h2><BarChart3 size={21}/> Evolução dos pedidos</h2>
     <p>Dados agrupados pela competência de criação de cada pedido.</p></div>
    <div className="pope-report-filters">
     <select value={period} onChange={e=>setPeriod(Number(e.target.value))}
      aria-label="Intervalo do relatório">
      <option value={3}>Últimos 3 meses</option><option value={6}>Últimos 6 meses</option>
      <option value={12}>Últimos 12 meses</option>
     </select>
     <select value={metric} onChange={e=>setMetric(e.target.value as Metric)}
      aria-label="Métrica do gráfico">
      {Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
     </select>
     <button type="button" className="admin-outline" onClick={csvExport}>
      <Download size={16}/> Exportar CSV</button>
    </div>
   </div>
   <div className="pope-report-chart" role="img"
    aria-label={'Gráfico de barras de '+labels[metric]+' para os últimos '+period+' meses'}>
    {selected.map(m=>{
     const ratio=m[metric]/max;
     return <div className="pope-report-column" key={m.month_key}>
      <div className="pope-report-column-plot">
       <span className="pope-report-column-value">{metric==='order_count'?m.order_count:formatBRL(m[metric])}</span>
       <div className="pope-report-bar-track"><span className="pope-report-bar" style={{height:(ratio*100)+'%'}}/></div>
      </div>
      <span className="pope-report-column-label">{monthLabel(m.month_key)}</span>
     </div>;
    })}
   </div>
   <div className="pope-report-totals">
    <span><CalendarDays size={17}/> No período: {selected.reduce((n,m)=>n+m.order_count,0)} pedidos</span>
    <span><FileSpreadsheet size={17}/> CSV: todas as 12 competências, incluindo meses sem movimento</span>
   </div>
  </section>
  <section className="pope-report-card">
   <div className="pope-report-heading"><div><h2><Boxes size={21}/> Estoque e validades</h2>
    <p>Itens abaixo ou iguais ao estoque mínimo, com lotes vencidos ou próximos do vencimento.</p></div>
    <Link href="/admin/estoque" className="admin-outline"><Boxes size={17}/> Abrir estoque</Link>
   </div>
   <div className="pope-report-alert-stats">
    <div><strong>{stock.filter(x=>x.available<=x.min_stock).length}</strong><span>SKUs no mínimo ou abaixo</span></div>
    <div><strong>{stock.filter(x=>x.expired_lots>0).length}</strong><span>SKUs com lotes vencidos</span></div>
    <div><strong>{stock.filter(x=>x.expiring_lots>0).length}</strong><span>SKUs com validade em até 30 dias</span></div>
   </div>
   <div className="ops-table-scroll"><table className="ops-table">
    <thead><tr><th>Produto</th><th>SKU</th><th>Disponível</th><th>Estoque mínimo</th><th>Lotes vencidos</th><th>Lotes vencendo</th></tr></thead>
    <tbody>{stock.map(x=><tr key={x.sku}>
     <td><strong>{x.product_name}</strong></td><td>{x.sku}</td>
     <td><span className={x.available<=x.min_stock?'pope-report-danger':''}>{x.available}</span></td>
     <td>{x.min_stock}</td><td>{x.expired_lots}</td><td>{x.expiring_lots}</td>
    </tr>)}</tbody>
   </table>
   {stock.length===0?<div className="admin-empty"><Boxes size={33}/><h3>Sem alertas de estoque</h3>
    <p>Os itens cadastrados não apresentam alertas dentro dos critérios atuais.</p></div>:null}
   </div>
   <p className="admin-help"><AlertTriangle size={15}/> A lista apresenta até 100 SKUs com alerta. A contagem de lotes considera apenas lotes com saldo físico maior que zero.</p>
  </section>
 </>;
}
