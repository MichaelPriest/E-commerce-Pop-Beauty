'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {createClient} from '@/lib/supabase/browser';
import {CepInput,PhoneInput} from '@/components/forms/masked-fields';
import {usePostalCodeLookup} from '@/hooks/use-postal-code-lookup';
import type {ShippingDestination} from '@/lib/shipping/shipment-preparation';

type Field= 'recipient'|'phone'|'postal_code'|'street'|'house_number'|
 'complement'|'district'|'city'|'state_code';
type AddressForm=Record<Field,string>;
type Props={orderId:string;editable:boolean;initial:ShippingDestination|null};
const uf=['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
 'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const init=(source:ShippingDestination|null):AddressForm=>({
 recipient:source?.recipient??'',phone:source?.phone??'',
 postal_code:source?.postal_code??'',street:source?.street??'',
 house_number:source?.house_number??'',complement:source?.complement??'',
 district:source?.district??'',city:source?.city??'',
 state_code:source?.state_code??''
});
export function DeliveryAddressEditor({orderId,editable,initial}:Props){
 const router=useRouter();
 const [form,setForm]=useState<AddressForm>(()=>init(initial));
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const postal=usePostalCodeLookup();
 useEffect(()=>{
  if(!postal.result)return;
  const p=postal.result;
  setForm(prev=>({...prev,street:p.street||prev.street,
   district:p.district||prev.district,city:p.city||prev.city,
   state_code:p.state_code||prev.state_code}));
 },[postal.result]);
 function update(field:Field,value:string){
  setForm(prev=>({...prev,[field]:value}));
  setError('');setNotice('');
 }
 async function submit(e:FormEvent){
  e.preventDefault();if(!editable||saving)return;
  const trimmed=Object.fromEntries(Object.entries(form).map(([k,v])=>[k,v.trim()])) as AddressForm;
  if(trimmed.recipient.length<2||!/^\d{10,11}$/.test(trimmed.phone)||
   !/^\d{8}$/.test(trimmed.postal_code)||
   trimmed.street.length<2||!trimmed.house_number||
   trimmed.district.length<2||trimmed.city.length<2||
   !uf.includes(trimmed.state_code)){
   setError('Confira destinatário, telefone, CEP, logradouro, número, bairro, cidade e UF.');
   return;
  }
  setSaving(true);setError('');setNotice('');
  try{
   const {error:saveError}=await createClient().rpc('save_admin_order_delivery_address',{
    p_order_id:orderId,p_address:trimmed
   });
   if(saveError)throw new Error(saveError.message);
   setNotice('Endereço administrativo salvo e registrado na auditoria do pedido.');
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Falha ao salvar endereço.');}
  finally{setSaving(false);}
 }
 return <section className="ops-form-card">
  <h2>Destinatário e endereço de entrega</h2>
  <p className="admin-help">Preenchimento administrativo para remessa. Os dados são privados
   e só podem ser modificados antes do despacho.</p>
  <form className="admin-form" onSubmit={submit}>
   <div className="admin-form-grid">
    <label>Destinatário *<input required minLength={2} maxLength={160}
     disabled={!editable||saving} value={form.recipient}
     onChange={e=>update('recipient',e.target.value)}/></label>
    <label>Telefone *<PhoneInput required disabled={!editable||saving}
     value={form.phone} onValueChange={value=>update('phone',value)}/></label>
    <label>CEP de entrega *<CepInput required disabled={!editable||saving}
     value={form.postal_code} onValueChange={value=>{
      update('postal_code',value);postal.reset();
     }}/></label>
    <div>
     <button type="button" className="admin-outline" disabled={!editable||saving||
      postal.loading||form.postal_code.length!==8}
      onClick={()=>void postal.lookup(form.postal_code)}>
      {postal.loading?'Consultando CEP...':'Buscar endereço pelo CEP'}</button>
     {postal.error?<p className="form-error" role="alert">{postal.error}</p>:null}
     {postal.result?<p className="admin-help">Endereço sugerido por {postal.result.source}.
      Confira número e complemento.</p>:null}
    </div>
    <label>Logradouro *<input required minLength={2} maxLength={160}
     disabled={!editable||saving} value={form.street}
     onChange={e=>update('street',e.target.value)}/></label>
    <label>Número *<input required maxLength={30}
     disabled={!editable||saving} value={form.house_number}
     onChange={e=>update('house_number',e.target.value)}/></label>
    <label>Complemento<input maxLength={120} disabled={!editable||saving}
     value={form.complement} onChange={e=>update('complement',e.target.value)}/></label>
    <label>Bairro *<input required minLength={2} maxLength={100}
     disabled={!editable||saving} value={form.district}
     onChange={e=>update('district',e.target.value)}/></label>
    <label>Cidade *<input required minLength={2} maxLength={100}
     disabled={!editable||saving} value={form.city}
     onChange={e=>update('city',e.target.value)}/></label>
    <label>UF *<select required disabled={!editable||saving}
     value={form.state_code} onChange={e=>update('state_code',e.target.value)}>
     <option value="">Selecione</option>
     {uf.map(x=><option key={x} value={x}>{x}</option>)}
    </select></label>
   </div>
   {error?<p className="form-error" role="alert">{error}</p>:null}
   {notice?<p className="form-success" role="status">{notice}</p>:null}
   <div className="admin-form-footer">
    <button className="admin-primary" type="submit" disabled={!editable||saving}>
     {saving?'Salvando...':'Salvar endereço de entrega'}</button>
   </div>
   {!editable?<p className="admin-help">Somente leitura: pedido já despachado ou fora da preparação.</p>:null}
  </form>
 </section>;
}
