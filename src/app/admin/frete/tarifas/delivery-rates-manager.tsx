'use client';

import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {Save} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {CepInput,onlyDigits} from '@/components/forms/masked-fields';
import {formatBRL} from '@/lib/products';
import {formatZip} from '@/types/customer-address';
import {parseMoneyBR} from '@/lib/catalog-csv-core';
import {deliveryDeadline,type CheckoutDeliveryRate} from '@/lib/checkout-delivery';

const initial={name:'',cep_start:'',cep_end:'',price:'',delivery_days:'',active:true};

export function DeliveryRatesManager({rates}:{rates:CheckoutDeliveryRate[]}){
 const router=useRouter();
 const [editing,setEditing]=useState<CheckoutDeliveryRate|null>(null);
 const [form,setForm]=useState(initial);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');

 function reset(){
  setEditing(null);setForm(initial);setError('');setNotice('');
 }

 function edit(rate:CheckoutDeliveryRate){
  setEditing(rate);setError('');setNotice('');
  setForm({
   name:rate.name,cep_start:rate.cep_start,cep_end:rate.cep_end,
   price:(rate.price_cents/100).toFixed(2).replace('.',','),
   delivery_days:String(rate.delivery_days),active:rate.active
  });
  document.getElementById('tarifa-de-entrega')?.scrollIntoView({block:'start'});
 }

 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const start=onlyDigits(form.cep_start,8),end=onlyDigits(form.cep_end,8);
   if(start.length!==8||end.length!==8||end<start){
    throw new Error('Informe dois CEPs válidos com o CEP final igual ou maior que o inicial.');
   }
   if(!/^\d{1,5}$/.test(form.delivery_days)||Number(form.delivery_days)>32767){
    throw new Error('Informe um prazo inteiro em dias úteis.');
   }
   const payload={
    name:form.name.trim(),cep_start:start,cep_end:end,price_cents:parseMoneyBR(form.price),
    delivery_days:Number(form.delivery_days),active:form.active
   };
   if(payload.name.length<2)throw new Error('Informe um nome para a opção de entrega.');
   const table=createClient().from('checkout_delivery_rates');
   const {data,error:saveError}=editing?
    await table.update(payload).eq('id',editing.id).eq('revision',editing.revision).select('id').maybeSingle():
    await table.insert(payload).select('id').single();
   if(saveError)throw new Error(saveError.message);
   if(!data){
    router.refresh();
    throw new Error('A tarifa mudou em outra sessão. Abra a versão mais recente para editar.');
   }
   reset();setNotice('Tarifa salva.');router.refresh();
  }catch(err){
   setError(err instanceof Error?err.message:'Falha ao salvar a tarifa.');
  }finally{
   setBusy(false);
  }
 }

 return <>
  <section className="pope-shipping-box" id="tarifa-de-entrega">
   <h2>{editing?'Editar tarifa':'Nova tarifa'}</h2>
   <form onSubmit={save}>
    <fieldset className="pope-rate-form" disabled={busy}>
     <label>Nome da entrega
      <input maxLength={80} minLength={2} required value={form.name}
       onChange={e=>setForm({...form,name:e.target.value})}/>
     </label>
     <label>CEP inicial
      <CepInput value={form.cep_start} onValueChange={value=>setForm({...form,cep_start:value})} required/>
     </label>
     <label>CEP final
      <CepInput value={form.cep_end} onValueChange={value=>setForm({...form,cep_end:value})} required/>
     </label>
     <label>Valor em reais
      <input inputMode="decimal" placeholder="12,90" required value={form.price}
       onChange={e=>setForm({...form,price:e.target.value})}/>
     </label>
     <label>Prazo máximo em dias úteis
      <input type="number" min={0} max={32767} step={1} required value={form.delivery_days}
       onChange={e=>setForm({...form,delivery_days:e.target.value})}/>
     </label>
     <label className="pope-rate-active">
      <input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/>
      Disponível no checkout de teste
     </label>
    </fieldset>
    {error&&<p role="alert" className="form-error">{error}</p>}
    {notice&&<p role="status" className="form-success">{notice}</p>}
    <div className="pope-receipt-links">
     <button className="admin-primary" disabled={busy}><Save size={16}/> {busy?'Salvando…':'Salvar tarifa'}</button>
     {editing&&<button type="button" className="admin-outline" onClick={reset} disabled={busy}>Cancelar edição</button>}
    </div>
   </form>
  </section>
  <section className="pope-shipping-box">
   <h2>Tarifas cadastradas</h2>
   {rates.length?<div className="ops-table-scroll"><table className="ops-table">
    <thead><tr><th>Entrega</th><th>Faixa de CEP</th><th>Valor</th><th>Prazo</th><th>Situação</th><th>Ação</th></tr></thead>
    <tbody>{rates.map(rate=><tr key={rate.id}>
     <td><strong>{rate.name}</strong></td>
     <td>{formatZip(rate.cep_start)} a {formatZip(rate.cep_end)}</td>
     <td>{formatBRL(rate.price_cents)}</td>
     <td>{deliveryDeadline(rate.delivery_days)}</td>
     <td>{rate.active?'Ativa':'Inativa'}</td>
     <td><button type="button" className="admin-outline" onClick={()=>edit(rate)} disabled={busy}>Editar</button></td>
    </tr>)}</tbody>
   </table></div>:<p className="admin-help">Nenhuma tarifa cadastrada.</p>}
  </section>
 </>;
}
