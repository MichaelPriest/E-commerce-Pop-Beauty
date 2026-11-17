'use client';

import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {Barcode,ClipboardCheck,Plus,Save,Trash2} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {parseUnitCost} from '@/lib/goods-receipts-core';
import {findStockVariant} from '@/lib/stock-variant-lookup';
import {
 dateOnlyBR,formatReceiptCost,openForReceipt,purchaseOrderNumber,purchaseOrderStates,
 type PurchaseOrder,type PurchaseOrderStatus
} from '@/lib/purchase-receiving';

type DraftLine = {id: string; sku: string; product: string; quantity: string; cost: string};
type DraftVersion = {id: string; updated_at: string};
const route = '/admin/estoque/compras';

export function PurchaseOrderManager({orders,suppliers,statusFilter,suggestedSku,suggestedQuantity}:{
 orders: PurchaseOrder[];
 suppliers: Array<{id: string; name: string}>;
 statusFilter: PurchaseOrderStatus | '';
 suggestedSku: string;
 suggestedQuantity: number;
}) {
 const router = useRouter();
 const [supplier,setSupplier] = useState('');
 const [expectedOn,setExpectedOn] = useState('');
 const [notes,setNotes] = useState('');
 const [lines,setLines] = useState<DraftLine[]>([]);
 const [barcode,setBarcode] = useState(suggestedSku);
 const [draft,setDraft] = useState<DraftVersion | null>(null);
 const [dirty,setDirty] = useState(false);
 const [busy,setBusy] = useState(false);
 const [error,setError] = useState('');
 const [notice,setNotice] = useState('');

 function changed() {
  setDirty(true);
  setError('');
  setNotice('');
 }

 function reset() {
  setDraft(null);
  setSupplier('');
  setExpectedOn('');
  setNotes('');
  setBarcode('');
  setLines([]);
  setDirty(false);
  setError('');
  setNotice('');
 }

 function edit(order: PurchaseOrder) {
  if (dirty && !window.confirm('Descartar as alterações do formulário atual?')) return;
  reset();
  setDraft({id:order.id,updated_at:order.updated_at});
  setSupplier(order.supplier_id);
  setExpectedOn(order.expected_on ?? '');
  setNotes(order.notes);
  setLines(order.purchase_order_items.map(item => ({
   id:item.variant_id,sku:item.sku_snapshot,product:item.product_snapshot,
   quantity:String(item.quantity),
   cost:item.unit_cost_cents === null ? '' : (item.unit_cost_cents/100).toFixed(2).replace('.',',')
  })));
  document.getElementById('pedido-de-compra')?.scrollIntoView({block:'start'});
 }

 async function add(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (busy || !barcode.trim() || lines.length >= 50) return;
  setBusy(true);
  setError('');
  try {
   const variant = await findStockVariant(barcode);
   if (!variant) throw new Error('SKU ou EAN ativo não encontrado.');
   if (lines.some(item => item.id === variant.id)) throw new Error('Este SKU já está no pedido.');
   setLines([...lines,{
    id:variant.id,sku:variant.sku,product:variant.products?.name ?? variant.name,
    quantity:String(!lines.length && variant.sku === suggestedSku ? suggestedQuantity : 1),cost:''
   }]);
   setBarcode('');
   changed();
  } catch (err) {
   setError(err instanceof Error ? err.message : 'Falha ao consultar o SKU.');
  } finally {
   setBusy(false);
  }
 }

 function update(id: string, field: 'quantity' | 'cost', value: string) {
  setLines(current => current.map(item => item.id === id ? {...item,[field]:value} : item));
  changed();
 }

 async function save() {
  if (busy || !supplier || !lines.length) return;
  setBusy(true);
  setError('');
  setNotice('');
  try {
   const items = lines.map(item => {
    if (!/^[1-9]\d{0,5}$/.test(item.quantity) || Number(item.quantity) > 100000) {
     throw new Error('Informe de 1 a 100.000 unidades para ' + item.sku + '.');
    }
    return {variant_id:item.id,quantity:Number(item.quantity),unit_cost_cents:parseUnitCost(item.cost)};
   });
   const {data,error:failure} = await createClient().rpc('save_purchase_order_draft',{
    p_order_id:draft?.id ?? null,p_expected_updated_at:draft?.updated_at ?? null,
    p_payload:{supplier_id:supplier,expected_on:expectedOn || null,notes,items}
   });
   if (failure) throw new Error(failure.message);
   if (!data?.id || !data?.updated_at) throw new Error('O servidor não confirmou a gravação.');
   setDraft(data as DraftVersion);
   setDirty(false);
   setNotice('Rascunho salvo. Confirme o pedido para vincular uma entrega.');
   router.refresh();
  } catch (err) {
   setError(err instanceof Error ? err.message : 'Falha ao salvar o pedido.');
  } finally {
   setBusy(false);
  }
 }

 async function transition(version: DraftVersion, action: 'confirm' | 'cancel' | 'close', reason = '') {
  if (busy) return;
  if (draft?.id === version.id && dirty) {
   setError('Salve ou descarte as alterações do formulário antes de continuar.');
   return;
  }
  setBusy(true);
  setError('');
  setNotice('');
  try {
   const {data,error:failure} = await createClient().rpc('transition_purchase_order',{
    p_order_id:version.id,p_action:action,p_reason:reason,p_expected_updated_at:version.updated_at
   });
   if (failure) throw new Error(failure.message);
   if (draft?.id === version.id) reset();
   setNotice(data === 'open' ? 'Pedido confirmado e disponível no recebimento.'
    : data === 'closed' ? 'Saldo restante encerrado.' : 'Pedido cancelado.');
   router.refresh();
  } catch (err) {
   setError(err instanceof Error ? err.message : 'Falha ao atualizar o pedido.');
  } finally {
   setBusy(false);
  }
 }

 return <>
  <section className="ops-form-card" id="pedido-de-compra">
   <div className="pope-receipt-heading">
    <h2>{draft ? 'Editar pedido de compra' : 'Novo pedido de compra'}</h2>
    <button type="button" className="admin-outline" disabled={busy}
     onClick={() => {if (!dirty || window.confirm('Descartar as alterações do formulário?')) reset();}}>
     Limpar formulário
    </button>
   </div>
   <div className="pope-receipt-form">
    <label>Fornecedor
     <select value={supplier} onChange={event => {setSupplier(event.target.value);changed();}} disabled={busy} required>
      <option value="">Selecione um fornecedor ativo</option>
      {suppliers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
     </select>
    </label>
    <label>Previsão de entrega
     <input type="date" value={expectedOn} onChange={event => {setExpectedOn(event.target.value);changed();}} disabled={busy}/>
    </label>
    <label className="pope-receipt-wide">Observações
     <textarea rows={2} value={notes} maxLength={1000}
      onChange={event => {setNotes(event.target.value);changed();}} disabled={busy}/>
    </label>
   </div>
   {!suppliers.length && <p><Link href="/admin/fornecedores">Cadastrar fornecedor</Link></p>}
   <form className="pope-receipt-barcode" onSubmit={add}>
    <label className="admin-search"><Barcode size={19}/>
     <input aria-label="SKU ou EAN" placeholder="Digite ou leia o SKU/EAN" autoComplete="off"
      value={barcode} onChange={event => setBarcode(event.target.value)} disabled={busy}/>
    </label>
    <button className="admin-primary" disabled={busy || !barcode.trim() || lines.length >= 50}>
     <Plus size={17}/> Incluir SKU
    </button>
   </form>
   {lines.length > 0 && <div className="ops-table-scroll"><table className="ops-table">
    <thead><tr><th>Produto / SKU</th><th>Quantidade</th><th>Custo previsto por unidade</th><th>Ação</th></tr></thead>
    <tbody>{lines.map(item => <tr key={item.id}>
     <td><strong>{item.product}</strong><small>{item.sku}</small></td>
     <td><input type="number" min={1} max={100000} step={1} value={item.quantity} disabled={busy}
      className="pope-receipt-input quantity" aria-label={'Quantidade de ' + item.sku}
      onChange={event => update(item.id,'quantity',event.target.value)}/></td>
     <td><input inputMode="decimal" placeholder="Opcional" value={item.cost} disabled={busy}
      className="pope-receipt-input quantity" aria-label={'Custo previsto de ' + item.sku}
      onChange={event => update(item.id,'cost',event.target.value)}/></td>
     <td><button type="button" className="admin-outline" disabled={busy} aria-label={'Remover ' + item.sku}
      onClick={() => {setLines(lines.filter(line => line.id !== item.id));changed();}}><Trash2 size={17}/></button></td>
    </tr>)}</tbody>
   </table></div>}
   <div className="pope-receipt-actions">
    <button type="button" className="admin-outline" disabled={busy || !supplier || !lines.length}
     onClick={() => void save()}><Save size={16}/> Salvar rascunho</button>
    <button type="button" className="admin-primary" disabled={busy || !draft || dirty}
     onClick={() => {if (draft) void transition(draft,'confirm');}}>
     <ClipboardCheck size={17}/> Confirmar pedido de compra
    </button>
   </div>
   {(error || notice) && <p className={error ? 'form-error' : 'form-success'} role={error ? 'alert' : 'status'}>
    {error || notice}
   </p>}
  </section>
  <section className="ops-form-card">
   <div className="pope-receipt-heading">
    <h2>Acompanhamento dos pedidos</h2>
    <form action={route} className="pope-receipt-links">
     <select name="situacao" aria-label="Situação dos pedidos" defaultValue={statusFilter} className="pope-receipt-input">
      <option value="">Todos os pedidos</option>
      {Object.entries(purchaseOrderStates).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
     </select>
     <button className="admin-outline">Filtrar</button>
    </form>
   </div>
   {!orders.length && <p className="admin-help">Nenhum pedido com este filtro.</p>}
   {orders.map(order => <details key={order.id} className="pope-purchase-details">
    <summary>
     <strong>{purchaseOrderNumber(order.number)} · {order.supplier_label}</strong>
     <span>{purchaseOrderStates[order.status]} · Entrega {dateOnlyBR(order.expected_on)}</span>
    </summary>
    {order.notes && <p>{order.notes}</p>}
    {order.closure_reason && <p>Motivo do encerramento — {order.closure_reason}</p>}
    <div className="ops-table-scroll"><table className="ops-table">
     <thead><tr><th>Produto / SKU</th><th>Pedido</th><th>Recebido</th><th>Saldo</th><th>Custo unitário previsto</th></tr></thead>
     <tbody>{order.purchase_order_items.map(item => <tr key={item.variant_id}>
      <td><strong>{item.product_snapshot}</strong><small>{item.sku_snapshot}</small></td>
      <td>{item.quantity}</td><td>{item.received_quantity}</td><td>{item.quantity-item.received_quantity}</td>
      <td>{item.unit_cost_cents === null ? '—' : formatReceiptCost(String(item.unit_cost_cents))}</td>
     </tr>)}</tbody>
    </table></div>
    <div className="pope-receipt-links">
     {order.status === 'draft' && <button type="button" className="admin-primary" disabled={busy}
      onClick={() => edit(order)}>Editar rascunho</button>}
     {openForReceipt(order.status) && <Link className="admin-primary"
      href={'/admin/estoque/recebimento?pedido='+order.id}>Conferir entrega</Link>}
    </div>
    {(order.status === 'draft' || openForReceipt(order.status)) &&
     <form className="pope-receipt-links" onSubmit={event => {
      event.preventDefault();
      const reason = String(new FormData(event.currentTarget).get('motivo') ?? '').trim();
      if (reason) void transition(order,order.status === 'partial' ? 'close' : 'cancel',reason);
     }}>
      <input className="pope-receipt-input" name="motivo" aria-label="Motivo do encerramento"
       placeholder="Motivo do encerramento" required maxLength={1000} disabled={busy}/>
      <button className="admin-outline" disabled={busy}>
       {order.status === 'partial' ? 'Encerrar saldo restante' : 'Cancelar pedido'}
      </button>
     </form>}
   </details>)}
  </section>
 </>;
}
