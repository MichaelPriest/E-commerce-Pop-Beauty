'use client';

import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {ClipboardCheck,RefreshCw,Truck} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {formatBRL} from '@/lib/products';
import type {CheckoutPreview} from '@/lib/checkout-preview';
import {
 checkoutDeliveryItems,deliveryDeadline,type CheckoutDeliveryOption,type CheckoutDeliveryOrder
} from '@/lib/checkout-delivery';

type Props={
 addressId:string; quote:CheckoutPreview; saving:boolean;
 setSaving:(value:boolean)=>void;
 onCreated:(order:CheckoutDeliveryOrder)=>void;
 commercial?:boolean;
 recipient?:string;
};

export function CheckoutDeliveryPanel({addressId,quote,saving,setSaving,onCreated,commercial=false,recipient=''}:Props){
 const [options,setOptions]=useState<CheckoutDeliveryOption[]|null>(null);
 const [selected,setSelected]=useState('');
 const [refresh,setRefresh]=useState(0);
 const [loadError,setLoadError]=useState('');
 const [reserveError,setReserveError]=useState('');
 const [fullName,setFullName]=useState(recipient),[cpf,setCpf]=useState('');
 const previous=useRef<{fingerprint:string;requestId:string}|null>(null);

 useEffect(()=>{
  let ignore=false;
  setOptions(null);setSelected('');setLoadError('');setReserveError('');
  createClient().rpc(commercial?'storefront_delivery_options':'list_checkout_delivery_options',
   {p_address_id:addressId}).then(({data,error})=>{
   if(ignore)return;
   if(error){setLoadError('Não foi possível consultar as tarifas para o endereço.');return;}
   const rows=(data??[]) as CheckoutDeliveryOption[];
   setOptions(rows);setSelected(rows[0]?.id??'');
  },()=>{
   if(!ignore)setLoadError('Não foi possível consultar as tarifas para o endereço.');
  });
  return ()=>{ignore=true;};
 },[addressId,refresh,commercial]);

 const chosen=options?.find(option=>option.id===selected);

 async function confirm(){
  if(!chosen||saving)return;
  setSaving(true);setReserveError('');
  try{
   const items=checkoutDeliveryItems(quote.lines);
   const params={
    p_address_id:addressId,p_address_version:chosen.address_version,
    p_rate_id:chosen.id,p_rate_revision:chosen.revision,p_items:items,
    ...(commercial?{full_name:fullName,tax_id:cpf}:{})
   };
   const fingerprint=JSON.stringify(params);
   if(previous.current?.fingerprint!==fingerprint){
    previous.current={fingerprint,requestId:crypto.randomUUID()};
   }
   const payload={...params,p_request_key:previous.current.requestId};
   let order:CheckoutDeliveryOrder|null;
   if(commercial){
    const res=await fetch('/api/checkout/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error??'Não foi possível criar o pedido.');
    order=data;
   }else{
    const {data,error}=await createClient().rpc('create_checkout_delivery_order',payload);
    if(error)throw new Error(error.code==='P0001'?error.message:'Confirme na sua conta se a reserva foi registrada.');
    order=data;
   }
   if(!order?.order_id)throw new Error('O servidor não confirmou a reserva. Consulte sua conta.');
   onCreated(order);
  }catch(err){
   setReserveError(err instanceof Error?err.message:'Falha ao confirmar o pedido de teste.');
  }finally{
   setSaving(false);
  }
 }

 return <section className="pope-checkout-rate-options" aria-label="Tarifa de entrega">
  <h3><Truck size={17}/> {commercial?'Entrega':'Entrega de teste'}</h3>
  {loadError?<p role="alert" className="form-error">{loadError}</p>
   :options===null?<p role="status">Consultando tarifas…</p>
   :options.length===0?<p>Não há tarifa ativa para este CEP.
    {!commercial&&<Link href="/admin/frete/tarifas" className="pope-checkout-link"> Cadastrar uma tarifa</Link>}</p>
   :<fieldset disabled={saving}>
    <legend>Escolha a entrega</legend>
    {options.map(option=><label key={option.id}>
     <input type="radio" name="checkout-delivery" checked={option.id===selected}
      onChange={()=>{setSelected(option.id);setReserveError('');}}/>
     <span><strong>{option.name}</strong><small>{deliveryDeadline(option.delivery_days)}</small></span>
     <strong>{formatBRL(option.price_cents)}</strong>
    </label>)}
   </fieldset>}
  {(loadError||options!==null)&&<button type="button" className="admin-outline" disabled={saving}
   onClick={()=>setRefresh(value=>value+1)}><RefreshCw size={15}/> Atualizar tarifas</button>}
  {chosen&&<>
   <dl className="pope-checkout-rate-total">
    <div><dt>Frete</dt><dd>{formatBRL(chosen.price_cents)}</dd></div>
    <div><dt>Total com entrega</dt><dd>{formatBRL(quote.subtotal_cents+chosen.price_cents)}</dd></div>
   </dl>
   {commercial&&<div className="admin-form">
    <label>Nome para a nota fiscal<input autoComplete="name" maxLength={160} value={fullName} disabled={saving}
     onChange={e=>setFullName(e.target.value)}/></label>
    <label>CPF para a nota fiscal<input inputMode="numeric" maxLength={14} value={cpf} disabled={saving}
     onChange={e=>setCpf(e.target.value.replace(/[^0-9.\-]/g,''))}/></label>
    <small>O CPF é usado na nota fiscal e nos dados do envio.</small>
   </div>}
   {reserveError&&<p role="alert" className="form-error">{reserveError}</p>}
   <button type="button" className="admin-primary" disabled={saving}
    onClick={()=>void confirm()}><ClipboardCheck size={17}/> {saving?'Reservando…':commercial?'Gerar pagamento':'Criar pedido de teste'}</button>
  </>}
 </section>;
}
