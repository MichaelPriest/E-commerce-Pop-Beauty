'use client';

import {Download} from 'lucide-react';
import {csvCellSafe} from '@/lib/fiscal-catalog-audit';
import {receiptCostInReais,type ReceiptCostReport} from '@/lib/purchase-receiving';

export function DownloadReceiptCosts({month,rows}:{month:string;rows:ReceiptCostReport['suppliers']}) {
 function download() {
  const lines = [
   ['Mês da entrada','Fornecedor','Recebimentos','Unidades','Unidades sem custo','Custo informado (R$)'],
   ...rows.map(row => [month,row.supplier_label,row.receipts,row.units,row.units_without_cost,
    row.units === row.units_without_cost ? '' : receiptCostInReais(row.cost_cents)])
  ];
  const csv = '\ufeff' + lines.map(line => line.map(csvCellSafe).join(';')).join('\r\n') + '\r\n';
  const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'pope-custos-de-recebimento-'+month+'.csv';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
 }
 return <button type="button" className="admin-outline" disabled={!rows.length} onClick={download}>
  <Download size={17}/> Baixar resumo CSV
 </button>;
}
