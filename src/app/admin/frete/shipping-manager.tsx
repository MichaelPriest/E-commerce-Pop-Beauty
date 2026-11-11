'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Truck,PackageCheck,MapPin,Save,Search,FlaskConical,ShieldCheck,
 AlertCircle,ExternalLink} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {formatBRL} from '@/lib/products';
import type {ShippingVariant} from './page';
import {CepInput,onlyDigits} from '@/components/forms/masked-fields';
import {usePostalCodeLookup} from '@/hooks/use-postal-code-lookup';

type Spec={weight_g:string;height_cm:string;width_cm:string;length_cm:string};
type Quote={service_id:string;service:string;carrier:string;price_cents:number;delivery_days:number};
const initialSpecs=(v:ShippingVariant):Spec=>({
 weight_g:String(v.weight_g??''),height_cm:String(v.height_cm??''),
 width_cm:String(v.width_cm??''),length_cm:String(v.length_cm??'')
});
export function ShippingManager({rows,initialOriginZip,sandboxTokenPresent}:{
 rows:ShippingVariant[];initialOriginZip:string;sandboxTokenPresent:boolean;
}){
 const router=useRouter();
 const [origin,setOrigin]=useState(initialOriginZip);
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [filter,setFilter]=useState(''),[onlyMissing,setOnlyMissing]=useState(false);
 const [editing,setEditing]=useState(''),[spec,setSpec]=useState<Spec>({weight_g:'',height_cm:'',width_cm:'',length_cm:''});
 const [target,setTarget]=useState(''),[productId,setProductId]=useState('');
 const originCep=usePostalCodeLookup();
 const destinationCep=usePostalCodeLookup();
 const lastOrigin=useRef(''),lastDestination=useRef('');
 useEffect(()=>{
  const value=onlyDigits(origin,8);
  if(value.length!==8||value===lastOrigin.current)return;
  const timer=window.setTimeout(()=>{
   lastOrigin.current=value;
   void originCep.lookup(value);
  },550);
  return ()=>window.clearTimeout(timer);
 },[origin,originCep.lookup]);
 useEffect(()=>{
  const value=onlyDigits(target,8);
  if(value.length!==8||value===lastDestination.current)return;
  const timer=window.setTimeout(()=>{
   lastDestination.current=value;
   void destinationCep.lookup(value);
  },550);
  return ()=>window.clearTimeout(timer);
 },[target,destinationCep.lookup]);
 const [quantity,setQuantity]=useState(1),[quotes,setQuotes]=useState<Quote[]>([]);
 const [quoteNotice,setQuoteNotice]=useState('');
 const eligible=useMemo(()=>{
  const grouped=new Map<string,ShippingVariant[]>();
  for(const v of rows){
   if(!v.active||!v.product_active||v.product_adult)continue;
   grouped.set(v.product_id,[...(grouped.get(v.product_id)||[]),v]);
  }
  return Array.from(grouped.values()).filter(group=>group.length===1)
   .map(group=>group[0]);
 },[rows]);
 const shown=rows.filter(v=>
  (!onlyMissing||!v.weight_g)&&
  [v.sku,v.name,v.product_name].join(' ').toLowerCase().includes(filter.toLowerCase()));
 const selected=eligible.find(v=>v.product_id===productId);
 async function saveOrigin(){
  if(busy)return;
  setBusy('origin');setError('');setNotice('');
  try{
   const {error:rpcError}=await createClient().rpc('save_shipping_origin',{p_zip:origin});
   if(rpcError)throw rpcError;
   setNotice('CEP de origem salvo. Nenhuma cotação comercial foi ativada.');
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar o CEP.');}
  finally{setBusy('');}
 }
 function startEdit(v:ShippingVariant){setEditing(v.id);setSpec(initialSpecs(v));setNotice('');setError('');}
 async function saveSpec(){
  if(!editing||busy)return;
  setBusy('spec');setError('');setNotice('');
  try{
   const nums=Object.fromEntries(Object.entries(spec).map(([k,v])=>[k,Number(v)]));
   const {error:rpcError}=await createClient().rpc('save_variant_shipping_specs',{
    p_variant_id:editing,p_weight_g:nums.weight_g,
    p_height_cm:nums.height_cm,p_width_cm:nums.width_cm,p_length_cm:nums.length_cm
   });
   if(rpcError)throw rpcError;
   setEditing('');setNotice('Peso e medidas do SKU salvos.');
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Erro ao salvar dimensões.');}
  finally{setBusy('');}
 }
 async function simulate(){
  if(!selected||busy)return;
  setBusy('quote');setError('');setQuotes([]);setQuoteNotice('');
  try{
   const zip=target.replace(/\D/g,'');
   const response=await fetch('/api/admin/shipping/quote',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({postal_code:zip,items:[{product_id:selected.product_id,quantity}]})
   });
   const body=await response.json();
   if(!response.ok)throw new Error(body.error||'Não foi possível cotar o frete.');
   setQuotes((body.quotes??[]) as Quote[]);
   setQuoteNotice(body.notice??'Simulação concluída.');
  }catch(e){setError(e instanceof Error?e.message:'Falha na cotação.');}
  finally{setBusy('');}
 }
 return <div className="pope-shipping-page">
  {error?<p role="alert" className="form-error">{error}</p>:null}
  {notice?<p role="status" className="form-success">{notice}</p>:null}
  <div className="pope-shipping-top">
   <section className="pope-shipping-box">
    <h2><MapPin size={20}/> CEP de origem</h2>
    <p>Informe o CEP de onde a loja realmente pretende postar os pedidos. Não é o CEP do cliente.</p>
    <label>CEP de postagem<CepInput value={origin} autoComplete="off" aria-label="CEP de origem"
     onValueChange={value=>{setOrigin(value);originCep.reset();}}/></label>
    {originCep.loading?<small className="pope-shipping-zip-feedback">Consultando CEP de origem...</small>:null}
    {originCep.error?<small role="alert" className="pope-shipping-zip-feedback warning">{originCep.error}</small>:null}
    {originCep.result?<small className="pope-shipping-zip-feedback">
     <MapPin size={14}/>{originCep.result.city}/{originCep.result.state_code} · {originCep.result.source}
    </small>:null}
    <button type="button" className="admin-primary" onClick={saveOrigin}
     disabled={!!busy||origin.replace(/\D/g,'').length!==8}>
     <Save size={16}/>{busy==='origin'?'Salvando...':'Salvar origem'}</button>
   </section>
   <section className="pope-shipping-box">
    <h2><FlaskConical size={20}/> Ambiente Melhor Envio</h2>
    <p>Usamos somente o endpoint de cálculo de frete no sandbox. Credenciais nunca são exibidas ao cliente.</p>
    <div className="pope-shipping-credential"><strong>MELHOR_ENVIO_SANDBOX_TOKEN</strong>
     <span className={sandboxTokenPresent?'pope-shipping-present':'pope-shipping-missing'}>
      {sandboxTokenPresent?'Variável presente':'Token não configurado'}</span></div>
    <p>Configure uma credencial exclusiva do sandbox nas variáveis do servidor Vercel, sem prefixo NEXT_PUBLIC_.</p>
    <Link href="https://docs.melhorenvio.com.br/docs/sandbox" target="_blank" rel="noopener noreferrer" className="admin-outline">
     <ExternalLink size={16}/> Documentação do sandbox</Link>
   </section>
  </div>
  <section className="pope-shipping-box">
   <div className="pope-shipping-header"><div><h2><PackageCheck size={20}/> Peso e dimensões dos SKUs</h2>
    <p>Informe peso em gramas e medidas unitárias em centímetros. Não utilize valores estimados como se fossem reais.</p></div>
    <label className="pope-shipping-missing-toggle"><input type="checkbox" checked={onlyMissing}
     onChange={e=>setOnlyMissing(e.target.checked)}/> Mostrar apenas pendentes</label>
   </div>
   <label className="admin-search"><Search size={17}/><input value={filter}
    onChange={e=>setFilter(e.target.value)} placeholder="Localizar SKU ou produto"/></label>
   <div className="pope-shipping-table"><table className="ops-table">
    <thead><tr><th>Produto / SKU</th><th>Peso</th><th>Dimensões (A × L × C)</th><th>Cadastro</th><th>Ação</th></tr></thead>
    <tbody>{shown.map(v=><tr key={v.id}>
     <td><strong>{v.product_name}</strong><small>{v.sku} · {v.name}</small></td>
     <td>{v.weight_g?v.weight_g+' g':'—'}</td>
     <td>{v.height_cm?String(v.height_cm)+' × '+v.width_cm+' × '+v.length_cm+' cm':'—'}</td>
     <td><span className={'ops-tag '+(v.weight_g?'status-paid':'status-pending')}>
      {v.weight_g?'Completo':'Pendente'}</span></td>
     <td><button className="admin-outline" type="button" disabled={!!busy}
      onClick={()=>startEdit(v)}>{v.weight_g?'Editar':'Preencher'}</button></td>
    </tr>)}</tbody>
   </table>{shown.length===0?<p className="admin-help">Nenhum SKU encontrado.</p>:null}</div>
   {editing?<div className="pope-shipping-spec">
    <h3>Dimensões do SKU {rows.find(v=>v.id===editing)?.sku}</h3>
    <div className="pope-shipping-spec-grid">
     {([
      ['weight_g','Peso (g)'],['height_cm','Altura (cm)'],
      ['width_cm','Largura (cm)'],['length_cm','Comprimento (cm)']
     ] as [keyof Spec,string][]).map(([field,label])=><label key={field}>{label}
      <input type="number" step="1" min="1"
       max={field==='weight_g'?30000:200}
       value={spec[field]}
       onChange={e=>setSpec(s=>({...s,[field]:e.target.value}))}/></label>)}
    </div>
    <div className="pope-shipping-spec-actions">
     <button type="button" className="admin-outline" onClick={()=>setEditing('')} disabled={!!busy}>Cancelar</button>
     <button type="button" className="admin-primary" onClick={saveSpec}
      disabled={!!busy||Object.values(spec).some(v=>!Number.isInteger(Number(v))||Number(v)<=0)}>
      <Save size={16}/>{busy==='spec'?'Salvando...':'Salvar medidas'}</button>
    </div>
   </div>:null}
  </section>
  <section className="pope-shipping-box">
   <h2><Truck size={20}/> Testar cotação de frete</h2>
   <p>Escolha um produto público com apenas uma variação ativa e medidas cadastradas. Só serão exibidos valores efetivamente retornados pela API de homologação.</p>
   <div className="pope-shipping-quote-form">
    <label>Produto<select value={productId} onChange={e=>{setProductId(e.target.value);setQuotes([]);}}>
     <option value="">Selecione um produto</option>
     {eligible.map(v=><option key={v.product_id} value={v.product_id}>
      {v.product_name} · {v.sku}{v.weight_g?'':' (sem medidas)'}
     </option>)}
    </select></label>
    <label>CEP destino
     <CepInput value={target} aria-label="CEP de destino" placeholder="01001-000"
      onValueChange={value=>{setTarget(value);destinationCep.reset();setQuotes([]);}}/>
     {destinationCep.loading?<small>Consultando CEP de destino...</small>:null}
     {destinationCep.error?<small role="alert" className="pope-shipping-zip-feedback warning">
      {destinationCep.error}</small>:null}
     {destinationCep.result?<small className="pope-shipping-zip-feedback">
      {destinationCep.result.city}/{destinationCep.result.state_code} · {destinationCep.result.source}
     </small>:null}
    </label>
    <label>Quantidade<input type="number" min="1" max="30" step="1" value={quantity}
     onChange={e=>setQuantity(Number(e.target.value))}/></label>
    <button className="admin-primary" type="button" onClick={simulate}
     disabled={!!busy||!sandboxTokenPresent||!selected?.weight_g||
      !/^[0-9]{8}$/.test(target.replace(/\D/g,''))||
      !Number.isInteger(quantity)||quantity<1||quantity>30}>
     <FlaskConical size={16}/>{busy==='quote'?'Consultando...':'Simular frete'}</button>
   </div>
   {!sandboxTokenPresent?<p className="pope-shipping-warning"><AlertCircle size={17}/>
    A cotação ficará indisponível até configurar o token de sandbox na Vercel.</p>:null}
   {quoteNotice?<p className="pope-shipping-info" role="status">{quoteNotice}</p>:null}
   {quotes.length?<div className="pope-shipping-quotes">
    {quotes.map(quote=><div key={quote.service_id}><strong>{quote.carrier} · {quote.service}</strong>
     <span>{formatBRL(quote.price_cents)} · {quote.delivery_days} dias (sandbox)</span></div>)}
   </div>:null}
   <p className="admin-help"><ShieldCheck size={15}/> Apenas consulta: não compra etiqueta, não confirma frete nem vincula preço à reserva de checkout.</p>
  </section>
 </div>;
}
