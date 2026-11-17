'use client';
import {useMemo,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {
 Barcode,Boxes,CheckCircle2,ClipboardCheck,PackagePlus,Plus,
 Save,Search,ShieldCheck,Trash2,Truck,AlertTriangle
} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {
 goodsReceiptPayload,validateReceiptLines,type ReceiptLine
} from '@/lib/goods-receipts-core';
import {brazilTodayISO} from '@/lib/catalog-quality';

type Supplier={id:string;name:string;tax_id:string|null;active:boolean};
type Variant={
 id:string;sku:string;ean:string|null;name:string;shade:string|null;active:boolean;
 products:{id:string;name:string;active:boolean;is_adult:boolean}|null;
 inventory:{on_hand:number;reserved:number}|null
};
type StoredItem={
 id:string;variant_id:string;sku_snapshot:string;product_snapshot:string;
 lot_code:string;expires_at:string|null;quantity:number;unit_cost_cents:number|null
};
type StoredReceipt={
 id:string;supplier_id:string|null;supplier_label:string;reference:string;
 document_date:string|null;notes:string;status:'draft'|'posted';
 created_at:string;posted_at:string|null;goods_receipt_items:StoredItem[]
};
function today(){return brazilTodayISO();}
function formatLocalDate(d:string|null){
 if(!d)return '—';
 return new Date(d).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});
}
const money=(v:number)=>Number.isFinite(v)?(v/100).toLocaleString('pt-BR',{
 style:'currency',currency:'BRL'}):'—';
export function GoodsReceiptManager({
 suppliers,variants,receipts
}:{suppliers:Supplier[];variants:Variant[];receipts:StoredReceipt[]}){
 const router=useRouter();
 const [supplierId,setSupplierId]=useState(''),[supplierLabel,setSupplierLabel]=useState('');
 const [reference,setReference]=useState(''),[documentDate,setDocumentDate]=useState('');
 const [notes,setNotes]=useState('');
 const [barcode,setBarcode]=useState(''),[lines,setLines]=useState<ReceiptLine[]>([]);
 const [draftId,setDraftId]=useState<string|null>(null);
 const [lastSaved,setLastSaved]=useState<string|null>(null);
 const [dirty,setDirty]=useState(false);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const validVariants=variants.filter(v=>v.active&&v.products?.active!==false);
 const byBarcode=useMemo(()=>{
  const map=new Map<string,Variant>();
  for(const v of validVariants){
   map.set(v.sku.toLowerCase(),v);
   if(v.ean)map.set(v.ean,v);
  }
  return map;
 },[variants]);
 const itemsCount=lines.reduce((sum,line)=>sum+(Number(line.quantity)||0),0);
 const todayString=today();
 const problems=validateReceiptLines(lines,todayString);
 const canSave=lines.length>0&&!problems.length&&supplierLabel.trim().length>=2&&
  supplierLabel.trim().length<=180&&reference.length<=100&&notes.length<=1000;
 const saved=!!draftId&&lastSaved===draftId&&!dirty;
 const allDrafts=receipts.filter(receipt=>receipt.status==='draft');
 function changed(){setDirty(true);setNotice('');setError('');}
 function selectSupplier(value:string){
  setSupplierId(value);
  const selected=suppliers.find(s=>s.id===value);
  if(selected)setSupplierLabel(selected.name);
  changed();
 }
 function clear(){
  setSupplierId('');setSupplierLabel('');setReference('');setDocumentDate('');
  setNotes('');setBarcode('');setLines([]);setDraftId(null);
  setLastSaved(null);setDirty(false);setError('');setNotice('');
 }
 function addLine(event?:FormEvent){
  event?.preventDefault();setError('');setNotice('');
  const value=barcode.trim();
  if(!value){setError('Digite ou leia o SKU/EAN para localizar um item.');return;}
  const variant=byBarcode.get(value.toLowerCase());
  if(!variant){
   setError('SKU ou código de barras não encontrado entre os SKUs ativos.');return;
  }
  if(lines.length>=25){setError('Limite de 25 linhas por recebimento.');return;}
  const line:ReceiptLine={
   variant_id:variant.id,sku:variant.sku,product:variant.products?.name??variant.name,
   shade:variant.shade||variant.name,lot_code:'SEM-LOTE',expires_at:'',
   quantity:'1',unit_cost:''
  };
  if(lines.some(x=>x.variant_id===line.variant_id&&x.lot_code===line.lot_code)){
   setError('Este SKU e lote já estão na lista. Altere a quantidade ou use outro lote.');return;
  }
  setLines(x=>[...x,line]);setBarcode('');changed();
 }
 function updateLine(index:number,field:keyof ReceiptLine,value:string){
  setLines(old=>old.map((item,i)=>i===index?{...item,[field]:value}:item));
  changed();
 }
 function loadReceipt(receipt:StoredReceipt){
  if(busy)return;
  if(dirty&&!window.confirm('Descartar as alterações não salvas do recebimento atual?'))return;
  if(receipt.status==='posted'){
   setError('Recebimento contabilizado é somente leitura. Consulte o histórico abaixo.');
   return;
  }
  setSupplierId(receipt.supplier_id??'');
  setSupplierLabel(receipt.supplier_label);
  setReference(receipt.reference);
  setDocumentDate(receipt.document_date??'');setNotes(receipt.notes);
  setLines(receipt.goods_receipt_items.map(item=>{
   const known=variants.find(v=>v.id===item.variant_id);
   return {
    variant_id:item.variant_id,sku:item.sku_snapshot,product:item.product_snapshot,
    shade:known?.shade||known?.name||'Padrão',lot_code:item.lot_code,
    expires_at:item.expires_at??'',quantity:String(item.quantity),
    unit_cost:item.unit_cost_cents===null?'':(item.unit_cost_cents/100)
     .toFixed(2).replace('.',',')
   };
  }));
  setDraftId(receipt.id);setLastSaved(receipt.id);setDirty(false);
  setNotice('Rascunho carregado. Confira os itens antes de contabilizar.');setError('');
 }
 async function saveDraft(){
  if(busy||!canSave)return;
  setBusy(true);setError('');setNotice('');
  try{
   const payload=goodsReceiptPayload(supplierId,supplierLabel,reference,
    documentDate,notes,lines);
   const {data,error:rpcError}=await createClient().rpc('save_goods_receipt_draft',{
    p_receipt_id:draftId,p_payload:payload
   });
   if(rpcError)throw rpcError;
   if(typeof data!=='string')throw new Error('ID do recebimento não foi retornado.');
   setDraftId(data);setLastSaved(data);setDirty(false);
   setNotice('Rascunho salvo. O estoque ainda NÃO foi alterado.');
   router.refresh();
  }catch(err){setError(err instanceof Error?err.message:'Falha ao salvar rascunho.');}
  finally{setBusy(false);}
 }
 async function post(){
  if(busy||!saved||!draftId)return;
  if(!window.confirm('CONTABILIZAR RECEBIMENTO?\n\nEsta operação registrará '+
   itemsCount+' unidade(s) no estoque dos SKUs selecionados. '+
   'A entrada não poderá ser registrada novamente. Confirma?'))return;
  setBusy(true);setError('');setNotice('');
  try{
   const {data,error:rpcError}=await createClient().rpc('post_goods_receipt',{
    p_receipt_id:draftId
   });
   if(rpcError)throw rpcError;
   const recorded=data as {units:number;lines:number;status:string};
   if(recorded?.status!=='posted')throw new Error('O banco não confirmou a contabilização.');
   clear();
   setNotice('Recebimento contabilizado: '+recorded.units+' unidades em '+
    recorded.lines+' lote(s). Histórico de estoque atualizado.');
   router.refresh();
  }catch(err){setError(err instanceof Error?err.message:'Não foi possível contabilizar.');}
  finally{setBusy(false);}
 }
 return <>
  <div className="admin-metric-row">
   <div><Truck/><small>Recebimentos registrados</small><strong>{receipts.length}</strong></div>
   <div><ClipboardCheck/><small>Rascunhos aguardando conferência</small>
    <strong>{allDrafts.length}</strong></div>
   <div><Boxes/><small>Itens nesta conferência</small><strong>{lines.length}</strong></div>
   <div><PackagePlus/><small>Unidades a receber</small><strong>{itemsCount}</strong></div>
  </div>
  <p className="ops-info"><ShieldCheck size={17}/> Primeiro salve como rascunho.
   A quantidade física só será alterada ao clicar em <strong>Contabilizar entrada</strong>.
   Recebimentos contabilizados não podem ser lançados novamente.</p>
  <section className="ops-form-card">
   <div className="pope-receipt-heading">
    <h2>{draftId?'Editando recebimento':'Novo recebimento'}</h2>
    <button className="admin-outline" type="button" disabled={busy}
     onClick={()=>{if(!dirty||window.confirm('Descartar informações não salvas?'))clear();}}>
     Limpar formulário
    </button>
   </div>
   <div className="pope-receipt-form">
    <label>Fornecedor cadastrado
     <select value={supplierId} onChange={e=>selectSupplier(e.target.value)} disabled={busy}>
      <option value="">Selecione ou digite um fornecedor</option>
      {suppliers.filter(s=>s.active||s.id===supplierId).map(s=>
       <option key={s.id} value={s.id}>{s.name}{s.active?'':' (inativo)'}</option>)}
     </select>
    </label>
    <label>Nome do fornecedor *
     <input value={supplierLabel} maxLength={180} placeholder="Ex.: Distribuidora de Cosméticos"
      onChange={e=>{setSupplierLabel(e.target.value);if(supplierId)setSupplierId('');changed();}}
      disabled={busy} required/>
    </label>
    <label>Documento do fornecedor (referência)
     <input value={reference} maxLength={100} placeholder="NF 1234 / Pedido 5678"
      onChange={e=>{setReference(e.target.value);changed();}} disabled={busy}/>
    </label>
    <label>Data do documento
     <input type="date" value={documentDate}
      onChange={e=>{setDocumentDate(e.target.value);changed();}} disabled={busy}/>
    </label>
    <label className="pope-receipt-wide">Observações
     <textarea rows={2} maxLength={1000} value={notes}
      onChange={e=>{setNotes(e.target.value);changed();}}
      placeholder="Estado da embalagem, divergência na entrega, conferente..." disabled={busy}/>
    </label>
   </div>
   <div className="pope-receipt-heading">
    <h2>Adicionar mercadoria por SKU ou EAN</h2>
    <Link href="/admin/fornecedores" className="admin-outline">Cadastrar fornecedor</Link>
   </div>
   <form className="pope-receipt-barcode" onSubmit={addLine}>
    <label className="admin-search"><Barcode size={19}/>
     <input autoComplete="off" value={barcode}
      placeholder="Leia com scanner USB/Bluetooth ou digite o SKU/EAN"
      onChange={e=>setBarcode(e.target.value)} disabled={busy}/>
    </label>
    <button type="submit" className="admin-primary" disabled={busy||lines.length>=25}>
     <Plus size={17}/> Incluir item
    </button>
   </form>
   <p className="admin-help">O leitor de código de barras que funciona como teclado
    pode enviar Enter para incluir. Informe lote, validade e quantidade antes de salvar.</p>
   <div className="ops-table-scroll">
    <table className="ops-table">
     <thead><tr><th>Produto / SKU</th><th>Lote *</th><th>Validade</th>
      <th>Quantidade *</th><th>Custo unitário (R$)</th><th>Ação</th></tr></thead>
     <tbody>{lines.map((item,index)=><tr key={index}>
      <td><strong>{item.product}</strong><small>{item.sku} · {item.shade}</small></td>
      <td><input className="pope-receipt-input" value={item.lot_code}
       maxLength={60} onChange={e=>updateLine(index,'lot_code',e.target.value)}
       aria-label={'Lote do item '+(index+1)} disabled={busy}/></td>
      <td><input type="date" min={todayString} className="pope-receipt-input"
       value={item.expires_at} onChange={e=>updateLine(index,'expires_at',e.target.value)}
       aria-label={'Validade do item '+(index+1)} disabled={busy}/></td>
      <td><input className="pope-receipt-input quantity" type="number" min={1}
       max={100000} step={1} value={item.quantity}
       onChange={e=>updateLine(index,'quantity',e.target.value)}
       aria-label={'Quantidade do item '+(index+1)} disabled={busy}/></td>
      <td><input className="pope-receipt-input quantity" inputMode="decimal"
       placeholder="Opcional" value={item.unit_cost}
       onChange={e=>updateLine(index,'unit_cost',e.target.value)}
       aria-label={'Custo unitário do item '+(index+1)} disabled={busy}/></td>
      <td><button type="button" className="admin-outline" disabled={busy}
       onClick={()=>{setLines(old=>old.filter((_,i)=>i!==index));changed();}}
       aria-label={'Remover '+item.sku}><Trash2 size={17}/></button></td>
     </tr>)}</tbody>
    </table>
   </div>
   {!lines.length?<p className="admin-help">Adicione o primeiro SKU/EAN para começar
    a conferência de mercadorias.</p>:null}
   {!!problems.length?<div role="alert" className="form-error">
    <strong>Corrija os itens antes de salvar:</strong>
    <ul>{problems.map((p,i)=><li key={i}>{p}</li>)}</ul>
   </div>:null}
   {error?<p role="alert" className="form-error"><AlertTriangle size={16}/> {error}</p>:null}
   {notice?<p role="status" className="form-success"><CheckCircle2 size={16}/> {notice}</p>:null}
   <div className="pope-receipt-actions">
    <button type="button" className="admin-outline" onClick={()=>void saveDraft()}
     disabled={busy||!canSave}>
     <Save size={17}/> {busy?'Processando...':'Salvar rascunho'}
    </button>
    <button type="button" className="admin-primary" disabled={busy||!saved}
     onClick={()=>void post()}>
     <ClipboardCheck size={17}/> Contabilizar entrada
    </button>
   </div>
   <p className="admin-help">Depois de salvar, qualquer alteração exige salvar
    novamente antes da contabilização. O servidor confere o lote e o estoque e
    reverte toda a operação se um item falhar.</p>
  </section>
  <section className="ops-form-card">
   <div className="pope-receipt-heading"><h2>Histórico de recebimentos</h2>
    <Link className="admin-outline" href="/admin/estoque">Ver movimentações</Link>
   </div>
   <div className="ops-table-scroll">
    <table className="ops-table"><thead><tr><th>Fornecedor</th><th>Documento</th>
     <th>Data</th><th>Itens</th><th>Situação</th><th>Ação</th></tr></thead>
     <tbody>{receipts.map(receipt=><tr key={receipt.id}>
      <td><strong>{receipt.supplier_label}</strong></td>
      <td>{receipt.reference||'—'}</td><td>{formatLocalDate(receipt.created_at)}</td>
      <td>{receipt.goods_receipt_items?.length??0}</td>
      <td><span className={'admin-status '+(receipt.status==='posted'?'live':'draft')}>
       {receipt.status==='posted'?'Contabilizado':'Rascunho'}</span></td>
      <td>{receipt.status==='draft'?<button className="admin-outline"
       type="button" disabled={busy} onClick={()=>loadReceipt(receipt)}>
       Conferir</button>:<span className="admin-help">Registrado</span>}</td>
     </tr>)}</tbody></table>
   </div>
   {!receipts.length?<p className="admin-help">Nenhum recebimento salvo ainda.</p>:null}
  </section>
 </>;
}
