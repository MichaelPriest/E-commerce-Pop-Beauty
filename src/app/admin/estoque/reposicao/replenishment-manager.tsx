'use client';
import {useMemo,useState} from 'react';
import Link from 'next/link';
import {
 AlertTriangle,Boxes,Download,PackagePlus,Search,ShieldCheck
} from 'lucide-react';
import {
 computeReplenishment,replenishmentCsv,type ReplenishmentVariant
} from '@/lib/stock-replenishment';
import {brazilTodayISO} from '@/lib/catalog-quality';

export function ReplenishmentManager({items,truncated}:{
 items:ReplenishmentVariant[];truncated:boolean
}){
 const [coverage,setCoverage]=useState(2);
 const [query,setQuery]=useState('');
 const [showAll,setShowAll]=useState(false);
 const today=brazilTodayISO();
 const rows=useMemo(()=>computeReplenishment(items,today,coverage),
  [items,coverage,today]);
 const visible=rows.filter(row=>
  (showAll||row.suggested>0)&&(!query||
   [row.sku,row.product,row.ean??'',row.shade].join(' ')
    .toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))));
 const flagged=rows.filter(row=>row.suggested>0);
 const total=flagged.reduce((sum,row)=>sum+row.suggested,0);
 const expired=rows.filter(row=>row.expired>0).length;
 function download(){
  const csv=replenishmentCsv(flagged);
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const href=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=href;
  a.download='pope-reposicao-'+today+'.csv';
  document.body.append(a);a.click();a.remove();URL.revokeObjectURL(href);
 }
 return <>
  <div className="admin-metric-row">
   <div><Boxes/><small>SKUs conferidos</small><strong>{rows.length}</strong></div>
   <div><AlertTriangle/><small>Com sugestão de compra</small>
    <strong>{flagged.length}</strong></div>
   <div><PackagePlus/><small>Unidades sugeridas</small>
    <strong>{total}</strong></div>
   <div><ShieldCheck/><small>Com unidades vencidas</small>
    <strong>{expired}</strong></div>
  </div>
  <p className="ops-info"><AlertTriangle size={18}/>
   Use a sugestão de reposição ao criar um pedido de compra.
   O cálculo exclui lotes vencidos do saldo disponível para venda.</p>
  {truncated?<p className="form-error" role="alert">A lista foi limitada a mil SKUs.
   Confira o restante antes de usar os totais para uma compra.</p>:null}
  <section className="ops-form-card">
   <h2>Critério da sugestão</h2>
   <p className="admin-help">Quantidade sugerida = máximo entre zero e
    (estoque mínimo × fator de cobertura − disponível vendável).
    Para SKU com mínimo zero, usamos uma unidade de referência.
    A sugestão é aproximada: confirme demanda e fornecedor antes de comprar.</p>
   <div className="pope-replenishment-controls">
    <label>Fator de cobertura
     <select value={coverage} onChange={e=>setCoverage(Number(e.target.value))}>
      <option value={1}>1× mínimo (reposição básica)</option>
      <option value={2}>2× mínimo (padrão)</option>
      <option value={3}>3× mínimo</option>
      <option value={4}>4× mínimo</option>
     </select>
    </label>
    <label className="admin-search"><Search size={16}/>
     <input placeholder="Buscar SKU, produto ou código de barras" value={query}
      onChange={e=>setQuery(e.target.value)}/>
    </label>
    <label className="pope-replenishment-toggle">
     <input type="checkbox" checked={showAll}
      onChange={e=>setShowAll(e.target.checked)}/> Mostrar todos
    </label>
    <button className="admin-outline" type="button" onClick={download}
     disabled={!flagged.length}>
     <Download size={17}/> Baixar lista CSV</button>
   </div>
   <p className="admin-help">Leitores USB/Bluetooth de código de barras podem preencher
    a busca como teclado. Não é necessário usar a câmera.</p>
   <div className="ops-table-scroll">
    <table className="ops-table">
     <thead><tr><th>Produto / SKU</th><th>EAN</th><th>Físico</th>
      <th>Reservado</th><th>Válido em lotes</th><th>Disponível</th>
      <th>Mínimo</th><th>Sugestão</th><th>Ação</th></tr></thead>
     <tbody>{visible.map(row=><tr key={row.id}>
      <td><strong>{row.product}</strong>
       <small>{row.sku} · {row.shade}</small>
       {!row.active?<small>Produto/variação inativa</small>:null}
      </td>
      <td>{row.ean??'—'}</td>
      <td>{row.physical}</td><td>{row.reserved}</td>
      <td>{row.validLots}</td>
      <td><strong>{row.available}</strong>
       {row.expired>0?<small>{row.expired} unidade(s) vencida(s)</small>:null}
      </td>
      <td>{row.minimum}</td>
      <td><strong>{row.suggested}</strong></td>
      <td><div className="pope-receipt-links">
       {row.suggested>0&&<Link className="ops-small primary"
        href={'/admin/estoque/compras?sku='+encodeURIComponent(row.sku)+'&quantidade='+row.suggested}>
        Criar pedido de compra</Link>}
       <Link className="ops-small"
       href={'/admin/estoque?busca='+encodeURIComponent(row.sku)+'&abrir=entrada'}>
       Registrar entrada</Link></div></td>
     </tr>)}</tbody>
    </table>
   </div>
   {!visible.length?<p className="admin-help">Nenhum SKU encontrado com os
    filtros atuais.</p>:null}
  </section>
 </>;
}
