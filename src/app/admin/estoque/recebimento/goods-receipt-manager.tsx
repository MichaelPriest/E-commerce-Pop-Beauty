'use client';
import {useMemo,useState,type FormEvent,type ChangeEvent} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {
 Barcode,Boxes,CheckCircle2,ClipboardCheck,PackagePlus,Plus,
 Save,ShieldCheck,Trash2,Truck,AlertTriangle,FileCode2
} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {
 goodsReceiptPayload,receiptLineKey,validateReceiptLines,type ReceiptLine
} from '@/lib/goods-receipts-core';
import {parseSupplierNfeXml} from '@/lib/supplier-nfe-preview';
import {brazilTodayISO} from '@/lib/catalog-quality';
import {findInvoiceVariants,findStockVariant,type StockVariant} from '@/lib/stock-variant-lookup';
import {
 compareReceipt,dateOnlyBR,formatReceiptCost,purchaseOrderNumber,
 type InvoiceLine,type PurchaseOrder,type ReceiptInvoice
} from '@/lib/purchase-receiving';

type Supplier={id:string;name:string;tax_id:string|null;active:boolean};
type StoredItem={
 id:string;variant_id:string;sku_snapshot:string;product_snapshot:string;
 lot_code:string;expires_at:string|null;quantity:number;unit_cost_cents:number|null
};
export type StoredReceipt={
 id:string;supplier_id:string|null;supplier_label:string;reference:string;
 document_date:string|null;notes:string;status:'draft'|'posted';
 created_at:string;posted_at:string|null;goods_receipt_items:StoredItem[];
 purchase_order_id:string|null;purchase_orders:{number:number}|null;draft_token:string|null;
 invoice_reference:string;invoice_lines:InvoiceLine[];invoice_warnings:string[];invoice_review_reason:string;
};
function formatLocalDate(d:string|null){
 if(!d)return '—';
 return new Date(d).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});
}
function savedInvoice(receipt:StoredReceipt):ReceiptInvoice|null{
 return receipt.invoice_reference ? {
  reference:receipt.invoice_reference,lines:receipt.invoice_lines,
  warnings:receipt.invoice_warnings,review_reason:receipt.invoice_review_reason
 } : null;
}

function ConferenceTable({rows,linked,hasInvoice}:{
 rows:ReturnType<typeof compareReceipt>;linked:boolean;hasInvoice:boolean
}){
 return <div className="ops-table-scroll"><table className="ops-table">
  <thead><tr><th>Produto / SKU</th>{linked&&<th>Saldo do pedido</th>}
   {hasInvoice&&<th>Na NF-e</th>}<th>Conferência física</th><th>Resultado</th></tr></thead>
  <tbody>{rows.map(row=><tr key={row.id}>
   <td><strong>{row.product}</strong><small>{row.sku}</small></td>
   {linked&&<td>{row.orderBalance}</td>}{hasInvoice&&<td>{row.declared}</td>}
   <td>{row.physical}</td>
   <td>{row.exceedsOrder?<strong>Excede o saldo do pedido</strong>
    :row.invoiceDifference===null?'—'
    :row.invoiceDifference===0?'Quantidades iguais'
    :row.invoiceDifference<0?Math.abs(row.invoiceDifference)+' a menos na entrega'
    :row.invoiceDifference+' a mais na entrega'}</td>
  </tr>)}</tbody>
 </table></div>;
}

export function GoodsReceiptManager({
 suppliers,variants,receipts,purchaseOrders,initialOrder,initialReceiptId,moreOrders
}:{suppliers:Supplier[];variants:StockVariant[];receipts:StoredReceipt[];
   purchaseOrders:PurchaseOrder[];initialOrder:PurchaseOrder|null;initialReceiptId?:string;moreOrders:boolean}){
 const router=useRouter();
 const [purchaseOrderId,setPurchaseOrderId]=useState(initialOrder?.id??'');
 const [supplierId,setSupplierId]=useState(initialOrder?.supplier_id??'');
 const [supplierLabel,setSupplierLabel]=useState(initialOrder?.supplier_label??'');
 const [reference,setReference]=useState(''),[documentDate,setDocumentDate]=useState('');
 const [notes,setNotes]=useState('');
 const [barcode,setBarcode]=useState(''),[lines,setLines]=useState<ReceiptLine[]>([]);
 const [invoice,setInvoice]=useState<ReceiptInvoice|null>(null);
 const [draftId,setDraftId]=useState<string|null>(null);
 const [draftToken,setDraftToken]=useState<string|null>(null);
 const [historyId,setHistoryId]=useState(initialReceiptId??'');
 const [dirty,setDirty]=useState(false);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const byBarcode=useMemo(()=>{
  const map=new Map<string,StockVariant>();
  for(const v of variants.filter(v=>v.active&&v.products?.active)){
   map.set(v.sku.toLowerCase(),v);
   if(v.ean)map.set(v.ean,v);
  }
  return map;
 },[variants]);
 const itemsCount=lines.reduce((sum,line)=>sum+(Number(line.quantity)||0),0);
 const todayString=brazilTodayISO();
 const problems=lines.length?validateReceiptLines(lines,todayString):[];
 const order=purchaseOrders.find(item=>item.id===purchaseOrderId);
 const orderUnavailable=!!purchaseOrderId&&!order;
 const comparison=compareReceipt(lines,invoice,order?.purchase_order_items??null);
 const excess=comparison.some(row=>row.exceedsOrder);
 const missingReason=!!invoice&&!invoice.review_reason.trim()&&
  (invoice.warnings.length>0||comparison.some(row=>row.invoiceDifference!==0));
 const canSave=lines.length>0&&!problems.length&&!orderUnavailable&&supplierLabel.trim().length>=2&&
  supplierLabel.trim().length<=180&&reference.length<=100&&notes.length<=1000;
 const saved=!!draftId&&!dirty&&canSave&&!excess&&!missingReason;
 const allDrafts=receipts.filter(receipt=>receipt.status==='draft');
 const historyReceipt=receipts.find(receipt=>receipt.id===historyId);
 const historyInvoice=historyReceipt?savedInvoice(historyReceipt):null;
 function changed(){setDirty(true);setNotice('');setError('');}
 function recount(){
  if(invoice?.review_reason)setInvoice({...invoice,review_reason:''});
  changed();
 }
 function reviewSupplier(){
  if(!invoice)return;
  const warning='Confirme que o emissor da NF-e corresponde ao fornecedor selecionado.';
  setInvoice({...invoice,warnings:Array.from(new Set([...invoice.warnings,warning])),review_reason:''});
 }
 function selectOrder(value:string){
  setPurchaseOrderId(value);
  const selected=purchaseOrders.find(item=>item.id===value);
  if(selected){
   if(supplierId!==selected.supplier_id)reviewSupplier();
   setSupplierId(selected.supplier_id);setSupplierLabel(selected.supplier_label);
  }
  changed();
 }
 function selectSupplier(value:string){
  if(value!==supplierId)reviewSupplier();
  setSupplierId(value);
  const selected=suppliers.find(s=>s.id===value);
  if(selected)setSupplierLabel(selected.name);
  changed();
 }
 function clear(){
  setPurchaseOrderId('');setInvoice(null);setDraftToken(null);
  setSupplierId('');setSupplierLabel('');setReference('');setDocumentDate('');
  setNotes('');setBarcode('');setLines([]);setDraftId(null);
  setDirty(false);setError('');setNotice('');
 }
 async function addLine(event?:FormEvent){
  event?.preventDefault();setError('');setNotice('');
  if(busy)return;
  const value=barcode.trim();
  if(!value){setError('Digite ou leia o SKU/EAN para localizar um item.');return;}
  setBusy(true);
  let variant:StockVariant|null;
  try{variant=byBarcode.get(value.toLowerCase())??await findStockVariant(value);}
  catch(err){setError(err instanceof Error?err.message:'Falha ao consultar o SKU.');return;}
  finally{setBusy(false);}
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
  setLines(x=>[...x,line]);setBarcode('');recount();
 }
 async function importNfe(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];event.target.value='';
  if(!file)return;
  if(file.size>2_000_000){setError('XML deve ter até 2 MB.');return;}
  if(lines.length&&
   !window.confirm('Substituir os itens atuais pelos itens identificados no XML?'))return;
  if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const preview=parseSupplierNfeXml(await file.text());
   if(preview.document.length>100||preview.issuer.length>180||preview.issuer.length<2)
    throw new Error('Número da nota ou nome do emitente fora do limite de cadastro.');
   const issues=[...preview.warnings];
   const selectedSupplier=suppliers.find(item=>item.id===order?.supplier_id);
   if(selectedSupplier?.tax_id&&preview.issuerTaxId&&selectedSupplier.tax_id!==preview.issuerTaxId)
    throw new Error('O CPF/CNPJ da NF-e difere do fornecedor do pedido de compra.');
   if(order&&(!selectedSupplier?.tax_id||!preview.issuerTaxId))
    issues.push('Confira se o emitente da NF-e corresponde ao fornecedor do pedido.');

   const byEan=new Map<string,StockVariant>();
   const bySku=new Map<string,StockVariant>();
   function indexVariant(variant:StockVariant){
    if(variant.ean)byEan.set(variant.ean,variant);
    bySku.set(variant.sku,variant);
   }
   for(const variant of new Set(byBarcode.values()))indexVariant(variant);
   const source=[...preview.declaredItems,...preview.items];
   const remote=await findInvoiceVariants(
    source.map(item=>item.barcode).filter(code=>!byEan.has(code)),
    source.map(item=>item.productCode).filter(code=>!bySku.has(code))
   );
   remote.forEach(indexVariant);
   const unmatched=new Set<string>();
   function match(item:{barcode:string;productCode:string;description:string}){
    const byGtin=byEan.get(item.barcode);
    const byCode=bySku.get(item.productCode);
    if(byGtin&&byCode&&byGtin.id!==byCode.id){
     unmatched.add(item.description+': EAN e código do produto indicam SKUs diferentes.');
     return null;
    }
    const variant=byGtin??byCode;
    if(!variant)unmatched.add(item.description+' ('+(item.barcode||item.productCode)+'): SKU ativo não identificado.');
    return variant;
   }

   const declared=new Map<string,InvoiceLine>();
   for(const item of preview.declaredItems){
    const variant=match(item);
    if(!variant)continue;
    const current=declared.get(variant.id);
    if(current)current.quantity+=item.quantity;
    else declared.set(variant.id,{variant_id:variant.id,sku:variant.sku,
     product:variant.products?.name??variant.name,quantity:item.quantity});
   }
   const identified:ReceiptLine[]=[];
   const identifiedByLot=new Map<string,ReceiptLine>();
   for(const item of preview.items){
    const variant=match(item);
    if(!variant)continue;
    const line={
     variant_id:variant.id,sku:variant.sku,product:variant.products?.name??variant.name,
     shade:variant.shade||variant.name,lot_code:item.lotCode,
     expires_at:item.expiresAt,quantity:String(item.quantity),
     unit_cost:item.unitCost
    };
    const key=receiptLineKey(line);
    const same=identifiedByLot.get(key);
    if(same&&same.expires_at===line.expires_at&&same.unit_cost===line.unit_cost){
     same.quantity=String(Number(same.quantity)+item.quantity);
    }else{
     if(!same)identifiedByLot.set(key,line);
     identified.push(line);
    }
   }
   issues.push(...unmatched);
   if(!identified.length)issues.push('Inclua manualmente os itens conferidos na entrega.');
   if(identified.length>25)issues.push('A prévia física incluiu somente as primeiras 25 linhas.');
   if(!order){
    const supplier=suppliers.find(s=>s.active&&s.tax_id&&s.tax_id===preview.issuerTaxId)??
     suppliers.find(s=>s.active&&!s.tax_id&&s.name.toLocaleLowerCase('pt-BR')===preview.issuer.toLocaleLowerCase('pt-BR'));
    setSupplierId(supplier?.id??'');
    setSupplierLabel(supplier?.name??preview.issuer);
   }
   setReference(preview.document);setDocumentDate(preview.date);
   if(identified.length)setLines(identified.slice(0,25));
   setInvoice({reference:preview.document,lines:Array.from(declared.values()),
    warnings:[...issues.slice(0,99).map(issue=>issue.slice(0,300)),
     ...(issues.length>99?['Há avisos adicionais no XML. Confira todos os itens no documento.']:[])],review_reason:''});
   changed();
   setNotice('NF-e carregada para conferência. Ajuste a contagem física ao que chegou.');
  }catch(err){
   setError(err instanceof Error?err.message:'Não foi possível ler o XML.');
  }finally{setBusy(false);}
 }
 function updateLine(index:number,field:keyof ReceiptLine,value:string){
  setLines(old=>old.map((item,i)=>i===index?{...item,[field]:value}:item));
  if(field==='quantity')recount();else changed();
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
  setPurchaseOrderId(receipt.purchase_order_id??'');
  setInvoice(savedInvoice(receipt));
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
  setDraftId(receipt.id);setDraftToken(receipt.draft_token);setDirty(false);
  setNotice('Rascunho carregado. Confira os itens antes de contabilizar.');setError('');
  document.getElementById('conferencia-de-entrega')?.scrollIntoView({block:'start'});
 }
 async function saveDraft(){
  if(busy||!canSave)return;
  setBusy(true);setError('');setNotice('');
  try{
   const payload=goodsReceiptPayload(supplierId,supplierLabel,reference,
    documentDate,notes,lines);
   const nextToken=crypto.randomUUID();
   const {data,error:rpcError}=await createClient().rpc('save_goods_receipt_draft',{
    p_receipt_id:draftId,p_payload:{...payload,purchase_order_id:purchaseOrderId||null,
     invoice,expected_draft_token:draftToken,draft_token:nextToken}
   });
   if(rpcError)throw new Error(rpcError.message);
   if(typeof data!=='string')throw new Error('ID do recebimento não foi retornado.');
   setDraftId(data);setDraftToken(nextToken);setDirty(false);
   setNotice('Rascunho salvo. Contabilize a entrada após a conferência física.');
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
    p_receipt_id:draftId,p_draft_token:draftToken
   });
   if(rpcError)throw new Error(rpcError.message);
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
   <div><Truck/><small>Recebimentos no histórico</small><strong>{receipts.length}</strong></div>
   <div><ClipboardCheck/><small>Rascunhos no histórico</small>
    <strong>{allDrafts.length}</strong></div>
   <div><Boxes/><small>Itens nesta conferência</small><strong>{lines.length}</strong></div>
   <div><PackagePlus/><small>Unidades a receber</small><strong>{itemsCount}</strong></div>
  </div>
  <p className="ops-info"><ShieldCheck size={17}/> Primeiro salve como rascunho.
   A quantidade física só será alterada ao clicar em <strong>Contabilizar entrada</strong>.
   Recebimentos contabilizados não podem ser lançados novamente.</p>
  <section className="ops-form-card" id="conferencia-de-entrega">
   <div className="pope-receipt-heading">
    <h2>{draftId?'Editando recebimento':'Novo recebimento'}</h2>
    <button className="admin-outline" type="button" disabled={busy}
     onClick={()=>{if(!dirty||window.confirm('Descartar informações não salvas?'))clear();}}>
     Limpar formulário
    </button>
   </div>
   <div className="pope-receipt-form">
    <label className="pope-receipt-wide">Pedido de compra
     <select value={purchaseOrderId} onChange={e=>selectOrder(e.target.value)} disabled={busy}>
      <option value="">Recebimento sem pedido vinculado</option>
      {orderUnavailable&&<option value={purchaseOrderId}>Pedido vinculado indisponível</option>}
      {purchaseOrders.map(item=><option key={item.id} value={item.id}>
       {purchaseOrderNumber(item.number)} · {item.supplier_label}
      </option>)}
     </select>
    </label>
    {moreOrders&&<p className="admin-help pope-receipt-wide">Para selecionar um pedido mais antigo,
     abra-o pela <Link href="/admin/estoque/compras">lista de pedidos de compra</Link>.</p>}
    {orderUnavailable&&<p role="alert" className="form-error pope-receipt-wide">
     Revise o pedido vinculado antes de salvar ou contabilizar.</p>}
    <label>Fornecedor cadastrado
     <select value={supplierId} onChange={e=>selectSupplier(e.target.value)} disabled={busy||!!order}>
      <option value="">Selecione ou digite um fornecedor</option>
      {order&&!suppliers.some(item=>item.id===order.supplier_id)&&
       <option value={order.supplier_id}>{order.supplier_label}</option>}
      {suppliers.filter(s=>s.active||s.id===supplierId).map(s=>
       <option key={s.id} value={s.id}>{s.name}{s.active?'':' (inativo)'}</option>)}
     </select>
    </label>
    <label>Nome do fornecedor *
     <input value={supplierLabel} maxLength={180} placeholder="Ex.: Distribuidora de Cosméticos"
      onChange={e=>{setSupplierLabel(e.target.value);if(supplierId)setSupplierId('');reviewSupplier();changed();}}
      disabled={busy||!!order} required/>
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
   <div className="pope-receipt-xml">
    <label><FileCode2 size={19}/> Carregar XML da NF-e do fornecedor
     <input type="file" accept=".xml,text/xml,application/xml"
      disabled={busy} onChange={e=>void importNfe(e)}/>
    </label>
    <p className="admin-help">O navegador lê o arquivo e identifica itens por EAN ou SKU.
     Confira a mercadoria entregue antes de registrar a entrada.</p>
   </div>
   <form className="pope-receipt-barcode" onSubmit={addLine}>
    <label className="admin-search"><Barcode size={19}/>
     <input aria-label="SKU ou EAN" autoComplete="off" value={barcode}
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
       onClick={()=>{setLines(old=>old.filter((_,i)=>i!==index));recount();}}
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
   {(order||invoice)&&<section className="pope-receipt-conference">
    <h3>Conferência de quantidades {invoice&&<small>· {invoice.reference}</small>}</h3>
    <ConferenceTable rows={comparison} linked={!!order} hasInvoice={!!invoice}/>
    {excess&&<p role="alert" className="form-error">Corrija os SKUs ou as quantidades que excedem o pedido.</p>}
    {invoice&&<>
     {invoice.warnings.length>0&&<ul className="pope-receipt-warnings">
      {invoice.warnings.map((warning,i)=><li key={i}>{warning}</li>)}
     </ul>}
     {(missingReason||invoice.review_reason)&&<div className="pope-receipt-form">
      <label className="pope-receipt-wide">Justificativa da divergência
       <textarea rows={2} maxLength={1000} value={invoice.review_reason} disabled={busy}
        onChange={e=>{setInvoice({...invoice,review_reason:e.target.value});changed();}}/>
      </label>
      {missingReason&&<p className="admin-help pope-receipt-wide">Registre a revisão da nota antes de contabilizar.</p>}
     </div>}
    </>}
   </section>}
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
    <table className="ops-table"><thead><tr><th>Fornecedor</th><th>Pedido de compra</th><th>Documento</th>
     <th>Data</th><th>Itens</th><th>Situação</th><th>Ação</th></tr></thead>
     <tbody>{receipts.map(receipt=><tr key={receipt.id}>
      <td><strong>{receipt.supplier_label}</strong></td>
      <td>{receipt.purchase_orders ? purchaseOrderNumber(receipt.purchase_orders.number) : '—'}</td>
      <td>{receipt.reference||'—'}</td><td>{formatLocalDate(receipt.posted_at??receipt.created_at)}</td>
      <td>{receipt.goods_receipt_items?.length??0}</td>
      <td><span className={'admin-status '+(receipt.status==='posted'?'live':'draft')}>
       {receipt.status==='posted'?'Contabilizado':'Rascunho'}</span></td>
      <td>{receipt.status==='draft'?<button className="admin-outline"
       type="button" disabled={busy} onClick={()=>loadReceipt(receipt)}>
       Conferir</button>:<a className="admin-outline" href="#historico-da-entrega"
        onClick={()=>setHistoryId(receipt.id)}>Ver conferência</a>}</td>
     </tr>)}</tbody></table>
   </div>
   {!receipts.length?<p className="admin-help">Nenhum recebimento salvo ainda.</p>:null}
  </section>
  <div id="historico-da-entrega">
   {historyReceipt&&<section className="ops-form-card">
    <h2>Conferência registrada</h2>
    <p>{historyReceipt.supplier_label} · {historyReceipt.reference||'Sem referência'}
     {historyReceipt.document_date&&' · Documento de '+dateOnlyBR(historyReceipt.document_date)}</p>
    {historyReceipt.notes&&<p>{historyReceipt.notes}</p>}
    {historyInvoice&&<div className="pope-receipt-conference">
     <h3>Quantidades da {historyInvoice.reference}</h3>
     <ConferenceTable rows={compareReceipt(historyReceipt.goods_receipt_items.map(item=>({
      variant_id:item.variant_id,sku:item.sku_snapshot,product:item.product_snapshot,quantity:item.quantity
     })),historyInvoice,null)} linked={false} hasInvoice={true}/>
     {historyInvoice.warnings.length>0&&<ul className="pope-receipt-warnings">
      {historyInvoice.warnings.map((warning,i)=><li key={i}>{warning}</li>)}
     </ul>}
     {historyInvoice.review_reason&&<p><strong>Justificativa</strong> · {historyInvoice.review_reason}</p>}
    </div>}
    <div className="ops-table-scroll"><table className="ops-table">
     <thead><tr><th>Produto / SKU</th><th>Lote</th><th>Validade</th><th>Quantidade</th><th>Custo unitário</th></tr></thead>
     <tbody>{historyReceipt.goods_receipt_items.map(item=><tr key={item.id}>
      <td>{item.product_snapshot}<small>{item.sku_snapshot}</small></td>
      <td>{item.lot_code}</td><td>{dateOnlyBR(item.expires_at)}</td><td>{item.quantity}</td>
      <td>{item.unit_cost_cents===null?'—':formatReceiptCost(String(item.unit_cost_cents))}</td>
     </tr>)}</tbody>
    </table></div>
   </section>}
  </div>
 </>;
}
