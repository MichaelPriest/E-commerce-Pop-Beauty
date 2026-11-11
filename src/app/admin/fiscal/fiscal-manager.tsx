'use client';
import {useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {createClient} from '@/lib/supabase/browser';
import {
 FileText,Printer,PackageCheck,ShieldAlert,Save,Building2,
 ClipboardCheck,Boxes,Truck
} from 'lucide-react';

type GenericRecord=Record<string,unknown>;
type FiscalProduct={id:string;name:string;brand:string;is_adult:boolean;active:boolean;
 product_fiscal_details:GenericRecord|GenericRecord[]|null};
type Order={id:string;status:string;origin:string;total_cents:number;created_at:string;
 shipping_address_snapshot:GenericRecord|null;
 order_items:{sku_snapshot:string;title_snapshot:string;quantity:number;unit_price_cents:number;variant_id:string|null}[]};
type Draft={order_id:string;fiscal_model:string;operation_nature:string|null;review_notes:string|null};
type Recipient={order_id:string;full_name:string;tax_id:string|null;state_registration:string|null};
type Packing={order_id:string;volumes:number;weight_g:number|null;packing_notes:string|null};
type Props={issuer:GenericRecord|null;products:FiscalProduct[];orders:Order[];
 drafts:Draft[];recipients:Recipient[];packages:Packing[]};
const issuerFields:[string,string,string][]=[
 ['legal_name','Razão social','text'],['trade_name','Nome fantasia','text'],
 ['cnpj','CNPJ (14 dígitos)','digits'],['state_registration','Inscrição estadual','text'],
 ['tax_regime','Regime tributário CRT (1, 2, 3 ou 4)','select'],
 ['state_code','UF','text'],['city','Município','text'],
 ['city_ibge_code','Código IBGE do município','digits'],
 ['postal_code','CEP do estabelecimento','digits'],['street','Logradouro','text'],
 ['house_number','Número','text'],['district','Bairro','text']
];
const taxFields:[string,string,string][]=[
 ['ncm','NCM (8 dígitos)','digits'],['cest','CEST (7 dígitos, se aplicável)','digits'],
 ['tax_origin','Origem da mercadoria (0–8)','origin'],
 ['commercial_unit','Unidade comercial (UN, CX...)','text'],
 ['cfop_sale','CFOP de referência (validar por operação)','digits'],
 ['icms_cst','CST do ICMS (regime normal)','digits'],
 ['csosn','CSOSN (Simples Nacional)','digits'],
 ['pis_cst','CST PIS','digits'],['cofins_cst','CST COFINS','digits'],
 ['cst_ibs_cbs','CST IBS/CBS','digits'],
 ['class_trib_ibs_cbs','Classificação tributária IBS/CBS','digits']
];
const emptyIssuer:Record<string,string>=Object.fromEntries(
 issuerFields.map(([key])=>[key,key==='state_code'?'SP':'']));
const emptyTax:Record<string,string>=Object.fromEntries(taxFields.map(([key])=>[key,'']));
function strings(values:GenericRecord|null,fields:[string,string,string][],defaults?:Record<string,string>){
 const out={...(defaults??{})};
 for(const [key] of fields)out[key]=values?.[key]===null||values?.[key]===undefined?
  out[key]??'':String(values[key]);
 return out;
}
const numberString=(s:string)=>s.replace(/\D/g,'');
const labelOrder=(o:Order)=>'#'+o.id.slice(0,8).toUpperCase()+
 ' · '+o.status+' · '+new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})
  .format(o.total_cents/100);
export function FiscalManager({issuer,products,orders,drafts,recipients,packages}:Props){
 const router=useRouter(),sb=useMemo(()=>createClient(),[]);
 const [tab,setTab]=useState<'issuer'|'products'|'orders'>('issuer');
 const [issuerForm,setIssuerForm]=useState<Record<string,string>>(
  strings(issuer,issuerFields,emptyIssuer));
 const [productId,setProductId]=useState(products.find(p=>!p.is_adult)?.id??'');
 const product=products.find(p=>p.id===productId);
 const productDetails=product?.product_fiscal_details;
 const initialTax=Array.isArray(productDetails)?productDetails[0]:productDetails;
 const [taxForm,setTaxForm]=useState<Record<string,string>>(
  strings(initialTax??null,taxFields));
 const [orderId,setOrderId]=useState(orders[0]?.id??'');
 const selectedOrder=orders.find(o=>o.id===orderId);
 const [model,setModel]=useState<'55'|'65'>(
  drafts.find(d=>d.order_id===orderId)?.fiscal_model==='65'?'65':'55');
 const [operation,setOperation]=useState(
  drafts.find(d=>d.order_id===orderId)?.operation_nature??'');
 const [fiscalNotes,setFiscalNotes]=useState(
  drafts.find(d=>d.order_id===orderId)?.review_notes??'');
 const [recipientForm,setRecipientForm]=useState({
  full_name:recipients.find(r=>r.order_id===orderId)?.full_name??'',
  tax_id:recipients.find(r=>r.order_id===orderId)?.tax_id??'',
  state_registration:recipients.find(r=>r.order_id===orderId)?.state_registration??''
 });
 const [volumes,setVolumes]=useState(
  String(packages.find(p=>p.order_id===orderId)?.volumes??1));
 const [weight,setWeight]=useState(
  String(packages.find(p=>p.order_id===orderId)?.weight_g??''));
 const [packingNotes,setPackingNotes]=useState(
  packages.find(p=>p.order_id===orderId)?.packing_notes??'');
 const [working,setWorking]=useState(''),[notice,setNotice]=useState(''),
  [error,setError]=useState('');
 const completed=products.filter(p=>{
  const value=Array.isArray(p.product_fiscal_details)?
   p.product_fiscal_details[0]:p.product_fiscal_details;
  return value?.ncm&&value?.tax_origin!==null&&value?.tax_origin!==undefined&&value?.cfop_sale;
 }).length;
 function pickProduct(id:string){
  setProductId(id);const p=products.find(x=>x.id===id);
  const raw=p?.product_fiscal_details;
  setTaxForm(strings(Array.isArray(raw)?raw[0]:raw??null,taxFields));
  setError('');setNotice('');
 }
 function pickOrder(id:string){
  setOrderId(id);
  const d=drafts.find(x=>x.order_id===id),r=recipients.find(x=>x.order_id===id),
   p=packages.find(x=>x.order_id===id);
  setModel(d?.fiscal_model==='65'?'65':'55');
  setOperation(d?.operation_nature??'');setFiscalNotes(d?.review_notes??'');
  setRecipientForm({full_name:r?.full_name??'',tax_id:r?.tax_id??'',
   state_registration:r?.state_registration??''});
  setVolumes(String(p?.volumes??1));setWeight(String(p?.weight_g??''));
  setPackingNotes(p?.packing_notes??'');setNotice('');setError('');
 }
 async function execute(title:string,call:()=>PromiseLike<{error?:{message:string}|null}>){
  if(working)return;setWorking(title);setNotice('');setError('');
  try{const r=await call();if(r.error)throw new Error(r.error.message);
   setNotice('Informações salvas. São preparatórias e não representam emissão fiscal.');
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar.');}
  finally{setWorking('');}
 }
 const inputField=(key:string,label:string,mode:string,values:Record<string,string>,
  setter:(updater:(s:Record<string,string>)=>Record<string,string>)=>void)=>{
  const v=values[key]??'';
  return <label key={key}>{label}
   {mode==='select'?<select value={v} onChange={e=>setter(p=>({...p,[key]:e.target.value}))}>
    <option value="">Selecionar CRT</option>
    <option value="1">1 — Simples Nacional</option>
    <option value="2">2 — Excesso de sublimite</option>
    <option value="3">3 — Regime normal</option>
    <option value="4">4 — MEI</option>
   </select>:mode==='origin'?<select value={v} onChange={e=>setter(p=>({...p,[key]:e.target.value}))}>
    <option value="">Selecionar origem</option>
    {Array.from({length:9},(_,i)=><option key={i} value={i}>{i}</option>)}
   </select>:
   <input value={v} maxLength={mode==='digits'?key==='cnpj'?14:key==='ncm'?8:key==='cest'?7:
     key==='city_ibge_code'?7:key==='postal_code'?8:key==='class_trib_ibs_cbs'?6:
     key==='cst_ibs_cbs'?3:key==='csosn'?3:key==='cfop_sale'?4:2:180}
    onChange={e=>setter(p=>({...p,[key]:mode==='digits'?
     numberString(e.target.value):key==='state_code'||key==='commercial_unit'?
     e.target.value.toUpperCase():e.target.value}))}/>}
  </label>;
 };
 return <div className="container admin-workspace pope-fiscal-area">
  <div className="admin-top">
   <div><div className="section-kicker">FISCAL • PREPARAÇÃO DE DOCUMENTOS</div>
    <h1><FileText size={29}/> Central fiscal e documentos</h1>
    <p>Cadastre as informações para NF-e (55), NFC-e (65), separação e etiquetas internas.</p>
   </div>
   <Link href="/admin/logistica" className="admin-outline">
    <Truck size={16}/> Logística</Link>
  </div>
  <p className="pope-fiscal-warning"><ShieldAlert size={20}/>
   <span><strong>Emissão oficial não habilitada.</strong> Não há transmissão à SEFAZ,
    certificado, autorização, XML fiscal assinado ou DANFE autorizado. As informações
    abaixo são uma preparação sujeita à conferência contábil e tributária.</span>
  </p>
  <div className="admin-metric-row">
   <div><Building2/><small>Emitente cadastrado</small><strong>{issuer?.cnpj?'Parcial':'Pendente'}</strong></div>
   <div><Boxes/><small>Produtos com dados fiscais básicos</small><strong>{completed}/{products.length}</strong></div>
   <div><ClipboardCheck/><small>Pedidos administrativos</small><strong>{orders.length}</strong></div>
   <div><FileText/><small>Notas autorizadas</small><strong>0</strong></div>
  </div>
  <div className="pope-fiscal-tabs" role="group" aria-label="Seções fiscais">
   {(['issuer','products','orders'] as const).map(x=>
    <button key={x} type="button" className={tab===x?'active':''} onClick={()=>{setTab(x);setError('');setNotice('');}}>
     {x==='issuer'?'Emitente':x==='products'?'Fiscal dos produtos':'Pedidos, NF e etiquetas'}</button>)}
  </div>
  {error?<p role="alert" className="form-error">{error}</p>:null}
  {notice?<p role="status" className="form-success">{notice}</p>:null}
  {tab==='issuer'?<section className="ops-form-card">
   <h2><Building2 size={19}/> Dados do emitente</h2>
   <p className="admin-help">Preencher conforme cadastro estadual e orientação da contabilidade.
    Não informar certificado digital ou CSC nesta tela.</p>
   <div className="admin-form-grid">{issuerFields.map(([key,label,mode])=>
    inputField(key,label,mode,issuerForm,setIssuerForm))}</div>
   <div className="admin-form-footer">
    <button type="button" className="admin-primary" disabled={!!working}
     onClick={()=>execute('issuer',()=>sb.rpc('save_fiscal_issuer',{p_data:issuerForm}))}>
     <Save size={16}/> {working?'Salvando...':'Salvar emitente'}</button>
   </div>
  </section>:null}
  {tab==='products'?<section className="ops-form-card">
   <h2><Boxes size={19}/> Tributação de mercadorias</h2>
   <p className="admin-help">Os campos são informações de referência. CFOP, CST, CSOSN,
    IBS/CBS e alíquotas definitivas dependem da operação e do regime do emitente.
    Não foram preenchidos automaticamente.</p>
   <label>Produto
    <select value={productId} onChange={e=>pickProduct(e.target.value)}>
     {products.map(p=><option key={p.id} value={p.id}>{p.name}{p.is_adult?' (+18)':''}</option>)}
    </select></label>
   {product?<><div className="admin-form-grid">
    {taxFields.map(([key,label,mode])=>inputField(key,label,mode,taxForm,setTaxForm))}
   </div><div className="admin-form-footer">
    <button type="button" className="admin-primary" disabled={!!working}
     onClick={()=>execute('product',()=>sb.rpc('save_fiscal_product',{
      p_product_id:productId,p_data:taxForm}))}>
     <Save size={16}/> {working?'Salvando...':'Salvar dados fiscais do produto'}</button>
   </div></>:<p className="admin-help">Cadastre primeiro os produtos na área Catálogo.</p>}
  </section>:null}
  {tab==='orders'?<div className="pope-fiscal-order-sections">
   <section className="ops-form-card">
    <h2><FileText size={19}/> Documento fiscal do pedido</h2>
    <label>Pedido administrativo
     <select value={orderId} onChange={e=>pickOrder(e.target.value)}>
      {orders.map(o=><option key={o.id} value={o.id}>{labelOrder(o)}</option>)}
     </select></label>
    {selectedOrder?<><div className="admin-form-grid">
     <label>Modelo fiscal
      <select value={model} onChange={e=>setModel(e.target.value as '55'|'65')}>
       <option value="55">NF-e — modelo 55</option>
       <option value="65">NFC-e — modelo 65</option>
      </select></label>
     <label>Natureza da operação (revisão contábil)
      <input maxLength={120} value={operation} onChange={e=>setOperation(e.target.value)}/>
     </label>
     <label>Destinatário / razão social
      <input maxLength={160} value={recipientForm.full_name}
       onChange={e=>setRecipientForm(p=>({...p,full_name:e.target.value}))}/></label>
     <label>CPF/CNPJ (somente números)
      <input inputMode="numeric" maxLength={14} value={recipientForm.tax_id}
       onChange={e=>setRecipientForm(p=>({...p,tax_id:numberString(e.target.value)}))}/></label>
     <label>IE do destinatário, quando aplicável
      <input maxLength={18} value={recipientForm.state_registration}
       onChange={e=>setRecipientForm(p=>({...p,state_registration:e.target.value}))}/></label>
     <label className="full">Observações para revisão fiscal
      <textarea rows={3} maxLength={600} value={fiscalNotes}
       onChange={e=>setFiscalNotes(e.target.value)}/></label>
    </div>
    <div className="admin-form-footer">
     <button className="admin-outline" disabled={!!working||!recipientForm.full_name.trim()}
      onClick={()=>execute('recipient',()=>sb.rpc('save_fiscal_recipient',{
       p_order_id:orderId,p_data:recipientForm}))}>
      <Save size={16}/> Salvar destinatário</button>
     <button className="admin-primary" disabled={!!working}
      onClick={()=>execute('draft',()=>sb.rpc('save_fiscal_order_draft',{
       p_order_id:orderId,p_model:model,p_operation:operation,p_notes:fiscalNotes}))}>
      <FileText size={16}/> Salvar rascunho</button>
     <Link className="admin-outline"
      href={'/admin/fiscal/documentos/'+orderId+'?tipo=conferencia'} target="_blank">
      <Printer size={16}/> Conferência fiscal</Link>
    </div></>:<p className="admin-help">Nenhum pedido administrativo cadastrado.</p>}
   </section>
   {selectedOrder?<section className="ops-form-card">
    <h2><PackageCheck size={19}/> Preparação de volume e etiqueta interna</h2>
    <div className="admin-form-grid">
     <label>Volumes
      <input type="number" min={1} max={50} value={volumes}
       onChange={e=>setVolumes(e.target.value)}/></label>
     <label>Peso total (gramas, opcional)
      <input type="number" min={1} max={500000} value={weight}
       onChange={e=>setWeight(e.target.value)}/></label>
     <label className="full">Observações de embalagem
      <input maxLength={400} value={packingNotes}
       onChange={e=>setPackingNotes(e.target.value)}/></label>
    </div>
    <div className="admin-form-footer">
     <button className="admin-primary" disabled={!!working||!['paid','packing','shipped','delivered'].includes(selectedOrder.status)}
      onClick={()=>execute('package',()=>sb.rpc('save_internal_package_preparation',{
       p_order_id:orderId,p_volumes:Number(volumes),
       p_weight_g:weight?Number(weight):null,p_notes:packingNotes}))}>
      <Save size={16}/> Salvar volumes</button>
     <Link href={'/admin/fiscal/documentos/'+orderId+'?tipo=separacao'}
      target="_blank" className="admin-outline"><Printer size={16}/> Lista de separação</Link>
     <Link href={'/admin/fiscal/documentos/'+orderId+'?tipo=etiqueta'}
      target="_blank" className="admin-outline"><Printer size={16}/> Etiquetas internas</Link>
    </div>
    <p className="admin-help">As etiquetas são somente internas; não criam frete,
     rastreamento, postagem ou documento fiscal.</p>
   </section>:null}
  </div>:null}
 </div>;
}
