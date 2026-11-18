'use client';

import {useMemo,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {CheckCircle2,Gift,Plus,Save,Search,Pencil,Calculator,AlertTriangle} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {formatBRL} from '@/lib/products';
import {parseMoneyBR} from '@/lib/catalog-csv-core';
import {
 normalizeCouponCode,validCouponCode,promotionCouponQuote,
 type PromotionCoupon
} from '@/lib/promotions/coupon-core';

type FormState={
 code:string;description:string;discount_type:'percent'|'fixed';
 discount_value:string;min_subtotal:string;max_discount:string;
 starts_at:string;ends_at:string;enabled:boolean;
};
function localDateTime(date:Date){
 return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
function emptyForm():FormState{
 const start=new Date();
 return {code:'',description:'',discount_type:'percent',discount_value:'10',
  min_subtotal:'0,00',max_discount:'',starts_at:localDateTime(start),
  ends_at:localDateTime(new Date(start.getTime()+7*86400000)),enabled:false};
}
const moneyInput=(cents:number)=> (cents/100).toFixed(2).replace('.',',');
const dateText=(raw:string)=>new Date(raw).toLocaleString('pt-BR',{
 timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'
});
function discountLabel(coupon:PromotionCoupon){
 return coupon.discount_type==='percent'?coupon.discount_value+'%':
  formatBRL(coupon.discount_value);
}
function couponState(coupon:PromotionCoupon,at:number){
 if(!coupon.enabled)return 'Inativo';
 if(at<Date.parse(coupon.starts_at))return 'Agendado';
 if(at>=Date.parse(coupon.ends_at))return 'Encerrado';
 return 'Em período';
}

export function CouponManager({coupons}:{coupons:PromotionCoupon[]}){
 const router=useRouter();
 const [search,setSearch]=useState('');
 const [filter,setFilter]=useState('todos');
 const [editing,setEditing]=useState<PromotionCoupon|null>(null);
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false);
 const [form,setForm]=useState<FormState>(emptyForm);
 const [notice,setNotice]=useState(''),[error,setError]=useState('');
 const [previewId,setPreviewId]=useState(coupons[0]?.id??'');
 const [previewSubtotal,setPreviewSubtotal]=useState('100,00');
 const now=Date.now();
 const visible=useMemo(()=>coupons.filter(c=>{
  const matches=[c.code,c.description].join(' ').toLocaleLowerCase('pt-BR')
   .includes(search.trim().toLocaleLowerCase('pt-BR'));
  if(!matches)return false;
  return filter==='ativos'?c.enabled:filter==='inativos'?!c.enabled:true;
 }),[coupons,search,filter]);
 const selected=coupons.find(c=>c.id===previewId);
 let previewMessage='Selecione um cupom para simular.';
 let previewDiscount:number|null=null,previewTotal:number|null=null;
 if(selected){
  try{
   const subtotal=parseMoneyBR(previewSubtotal);
   const quote=promotionCouponQuote(selected,subtotal);
   previewMessage=quote.message;
   previewDiscount=quote.discount_cents;
   previewTotal=quote.total_cents;
  }catch{
   previewMessage='Informe um subtotal válido, por exemplo 149,90.';
  }
 }
 function startNew(){
  setEditing(null);setForm(emptyForm());setOpen(true);setError('');setNotice('');
 }
 function startEdit(c:PromotionCoupon){
  setEditing(c);
  setForm({code:c.code,description:c.description,discount_type:c.discount_type,
   discount_value:c.discount_type==='percent'?String(c.discount_value):moneyInput(c.discount_value),
   min_subtotal:moneyInput(c.min_subtotal_cents),
   max_discount:c.max_discount_cents===null?'':moneyInput(c.max_discount_cents),
   starts_at:localDateTime(new Date(c.starts_at)),
   ends_at:localDateTime(new Date(c.ends_at)),enabled:c.enabled});
  setOpen(true);setError('');setNotice('');
 }
 function change<K extends keyof FormState>(field:K,value:FormState[K]){
  setForm(prev=>({...prev,[field]:value}));
 }
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  setError('');setNotice('');
  try{
   const code=normalizeCouponCode(form.code);
   if(!validCouponCode(code))throw new Error('Código deve ter 4 a 24 letras, números, hífen ou sublinhado, sem espaços.');
   const value=form.discount_type==='percent'?Number(form.discount_value):parseMoneyBR(form.discount_value);
   if(form.discount_type==='percent'&&(!Number.isInteger(value)||value<1||value>90))
    throw new Error('O percentual deve estar entre 1% e 90%.');
   if(form.discount_type==='fixed'&&value<100)
    throw new Error('O desconto fixo mínimo é de R$ 1,00.');
   const min=parseMoneyBR(form.min_subtotal);
   const cap=form.discount_type==='percent'&&form.max_discount.trim()?
    parseMoneyBR(form.max_discount):null;
   if(cap!==null&&cap<1)throw new Error('O teto do desconto deve ser maior que zero.');
   const start=new Date(form.starts_at),end=new Date(form.ends_at);
   if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||
      end.getTime()<=start.getTime())
    throw new Error('A data final deve ser posterior à data inicial.');
   const payload={
    code,description:form.description.trim(),discount_type:form.discount_type,
    discount_value:value,min_subtotal_cents:min,max_discount_cents:cap,
    starts_at:start.toISOString(),ends_at:end.toISOString(),enabled:form.enabled
   };
   setBusy(true);
   const table=createClient().from('promotion_coupons');
   const {data, error:err}=editing?
    await table.update(payload).eq('id',editing.id).eq('updated_at',editing.updated_at)
     .select('id').maybeSingle():
    await table.insert(payload).select('id').single();
   if(err)throw new Error(err.code==='23505'?'Este código já está cadastrado.':err.message);
   if(!data)throw new Error('O cupom foi alterado em outra sessão. Atualize a página e tente novamente.');
   setNotice(editing?'Cupom atualizado.':'Cupom cadastrado. Ele ainda não concede desconto no checkout.');
   setOpen(false);setEditing(null);router.refresh();
  }catch(err){
   setError(err instanceof Error?err.message:'Não foi possível salvar o cupom.');
  }finally{setBusy(false);}
 }
 return <>
  <div className="pope-coupon-warning" role="status"><AlertTriangle size={20}/>
   <div><strong>Modo de preparação — sem desconto aplicado em vendas.</strong>
    <p>Ativar um cupom permite apenas sua simulação administrativa. O checkout,
     os pagamentos e os documentos fiscais não utilizam estes valores.</p>
   </div>
  </div>
  <div className="admin-top pope-coupon-toolbar">
   <label className="admin-search"><Search size={17}/>
    <input value={search} onChange={e=>setSearch(e.target.value)}
     placeholder="Buscar código ou descrição" aria-label="Pesquisar cupons"/>
   </label>
   <select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filtrar cupons">
    <option value="todos">Todos</option>
    <option value="ativos">Marcados como ativos</option>
    <option value="inativos">Inativos</option>
   </select>
   <button type="button" className="admin-primary" onClick={startNew}>
    <Plus size={17}/> Novo cupom
   </button>
  </div>
  {notice?<p className="form-success" role="status"><CheckCircle2 size={17}/>{notice}</p>:null}
  {error&&!open?<p className="form-error" role="alert">{error}</p>:null}
  <section className="admin-panel">
   <h2><Gift size={20}/> Campanhas cadastradas ({visible.length})</h2>
   {visible.length?<div className="ops-table-scroll"><table className="ops-table">
    <thead><tr><th>Código</th><th>Desconto</th><th>Pedido mínimo</th>
     <th>Período</th><th>Status interno</th><th>Ação</th></tr></thead>
    <tbody>{visible.map(c=><tr key={c.id}>
     <td><strong><code>{c.code}</code></strong><small>{c.description||'Sem descrição'}</small></td>
     <td><strong>{discountLabel(c)}</strong>
      {c.max_discount_cents!==null?<small>Até {formatBRL(c.max_discount_cents)}</small>:null}</td>
     <td>{formatBRL(c.min_subtotal_cents)}</td>
     <td><small>{dateText(c.starts_at)} a {dateText(c.ends_at)}</small></td>
     <td><span className={'admin-status '+(couponState(c,now)==='Em período'?'live':'draft')}>
      {couponState(c,now)}</span></td>
     <td><button className="admin-outline" type="button" onClick={()=>startEdit(c)}>
      <Pencil size={15}/> Editar</button></td>
    </tr>)}</tbody>
   </table></div>:<div className="admin-empty"><Gift size={32}/><h3>Nenhum cupom encontrado</h3>
    <p>Cadastre uma campanha e teste seus valores antes de disponibilizá-la aos clientes.</p>
   </div>}
  </section>
  <section className="admin-panel pope-coupon-simulator">
   <h2><Calculator size={21}/> Simulador interno de descontos</h2>
   <p className="admin-help">A simulação considera subtotal, período, situação e teto,
    mas não reserva códigos, não limita utilizações e não altera pedidos.</p>
   <div className="pope-coupon-simulator-inputs">
    <label>Cupom
     <select value={selected?.id??''} onChange={e=>setPreviewId(e.target.value)}>
      {!selected&&<option value="">Selecione um cupom</option>}
      {coupons.map(c=><option key={c.id} value={c.id}>{c.code}</option>)}
     </select>
    </label>
    <label>Subtotal dos produtos (R$)
     <input inputMode="decimal" value={previewSubtotal} maxLength={15}
      onChange={e=>setPreviewSubtotal(e.target.value)} placeholder="100,00"/>
    </label>
   </div>
   <p className="pope-coupon-preview-note" role="status">{previewMessage}</p>
   {previewTotal!==null&&previewDiscount!==null?<dl className="pope-coupon-preview-result">
    <div><dt>Desconto simulado</dt><dd>{formatBRL(previewDiscount)}</dd></div>
    <div><dt>Produtos após desconto</dt><dd>{formatBRL(previewTotal)}</dd></div>
   </dl>:null}
  </section>
  {open?<div className="admin-modal-overlay" role="presentation"
   onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setOpen(false);}}>
   <section className="admin-modal" role="dialog" aria-modal="true"
    aria-label={editing?'Editar cupom':'Cadastrar cupom'}>
    <div className="admin-modal-header">
     <div><span className="section-kicker">CAMPANHA INTERNA</span>
      <h2>{editing?'Editar cupom':'Novo cupom'}</h2></div>
     <button type="button" disabled={busy} onClick={()=>setOpen(false)}
      aria-label="Fechar">×</button>
    </div>
    <form className="admin-form" onSubmit={save}>
     <fieldset disabled={busy} className="pope-coupon-fieldset">
      <div className="admin-form-grid">
       <label>Código do cupom *
        <input required minLength={4} maxLength={24} autoComplete="off"
         value={form.code} onChange={e=>change('code',normalizeCouponCode(e.target.value))}
         placeholder="POPE10"/>
       </label>
       <label>Tipo de desconto
        <select value={form.discount_type}
         onChange={e=>change('discount_type',e.target.value as FormState['discount_type'])}>
         <option value="percent">Percentual (%)</option>
         <option value="fixed">Valor fixo (R$)</option>
        </select>
       </label>
       <label>Desconto {form.discount_type==='percent'?'(%)':'(R$)'} *
        <input required inputMode="decimal" value={form.discount_value}
         onChange={e=>change('discount_value',e.target.value)}
         placeholder={form.discount_type==='percent'?'10':'15,00'}/>
       </label>
       <label>Subtotal mínimo (R$)
        <input required inputMode="decimal" value={form.min_subtotal}
         onChange={e=>change('min_subtotal',e.target.value)} placeholder="0,00"/>
       </label>
       {form.discount_type==='percent'?<label>Teto do desconto (R$) — opcional
        <input inputMode="decimal" value={form.max_discount}
         onChange={e=>change('max_discount',e.target.value)} placeholder="Sem teto"/>
       </label>:null}
       <label className="full">Descrição da campanha
        <input maxLength={180} value={form.description}
         onChange={e=>change('description',e.target.value)}
         placeholder="Ex.: Inauguração Popê Beauty"/>
       </label>
       <label>Início da campanha *
        <input required type="datetime-local" value={form.starts_at}
         onChange={e=>change('starts_at',e.target.value)}/>
       </label>
       <label>Fim da campanha *
        <input required type="datetime-local" value={form.ends_at}
         onChange={e=>change('ends_at',e.target.value)}/>
       </label>
       <label className="admin-form-check full"><input type="checkbox"
        checked={form.enabled} onChange={e=>change('enabled',e.target.checked)}/>
        Ativar apenas para simulações administrativas
       </label>
      </div>
     </fieldset>
     <p className="admin-help">Nenhuma opção deste cadastro habilita cupons
      na compra pública. Para interromper uma campanha, desmarque a ativação.</p>
     {error?<p className="form-error" role="alert">{error}</p>:null}
     <div className="admin-form-footer">
      <button type="button" className="admin-outline" disabled={busy}
       onClick={()=>setOpen(false)}>Cancelar</button>
      <button className="admin-primary" type="submit" disabled={busy}>
       <Save size={17}/>{busy?'Salvando...':'Salvar cupom'}</button>
     </div>
    </form>
   </section>
  </div>:null}
 </>;
}
