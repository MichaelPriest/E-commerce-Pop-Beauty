'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {MapPin,Plus,Edit2,Trash2,Save,X,CheckCircle2,House,Phone,ShieldCheck} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {BRAZIL_STATES,formatZip,type CustomerAddress} from '@/types/customer-address';
import {CepInput,PhoneInput,onlyDigits} from '@/components/forms/masked-fields';
import {usePostalCodeLookup} from '@/hooks/use-postal-code-lookup';

type AddressFields={
 recipient:string;phone:string;postal_code:string;street:string;house_number:string;
 complement:string;district:string;city:string;state_code:string;is_default:boolean;
};
const empty:AddressFields={
 recipient:'',phone:'',postal_code:'',street:'',house_number:'',
 complement:'',district:'',city:'',state_code:'SP',is_default:true
};
export function AddressManager({initialAddresses}:{initialAddresses:CustomerAddress[]}){
 const router=useRouter();
 const [items,setItems]=useState(initialAddresses);
 const [editing,setEditing]=useState<string|null|undefined>(undefined);
 const [fields,setFields]=useState<AddressFields>(empty);
 const [busy,setBusy]=useState(false);
 const {loading:zipBusy,error:zipError,result:zipResult,lookup:lookupZip,reset:resetZip}=usePostalCodeLookup();
 const lastRequestedZip=useRef('');
 const [message,setMessage]=useState(''),[error,setError]=useState('');
 useEffect(()=>setItems(initialAddresses),[initialAddresses]);
 // Consulta automática, com debounce, apenas ao alterar para um CEP completo.
 useEffect(()=>{
  if(editing===undefined)return;
  const zip=onlyDigits(fields.postal_code,8);
  if(zip.length!==8||zip===lastRequestedZip.current)return;
  const timer=window.setTimeout(()=>{
   lastRequestedZip.current=zip;
   void lookupZip(zip);
  },500);
  return ()=>window.clearTimeout(timer);
 },[editing,fields.postal_code,lookupZip]);
 useEffect(()=>{
  if(!zipResult||editing===undefined)return;
  setFields(old=>{
   if(onlyDigits(old.postal_code,8)!==zipResult.postal_code)return old;
   return {
    ...old,street:zipResult.street||old.street,
    district:zipResult.district||old.district,
    city:zipResult.city||old.city,state_code:zipResult.state_code||old.state_code
   };
  });
  setMessage('CEP localizado via '+zipResult.source+'. Confira o número e o complemento.');
 },[zipResult,editing]);
 function start(address?:CustomerAddress){
  resetZip();
  lastRequestedZip.current=onlyDigits(address?.postal_code??'',8);
  setEditing(address?.id??null);
  setFields(address?{
   recipient:address.recipient,phone:address.phone,postal_code:address.postal_code,
   street:address.street,house_number:address.house_number,complement:address.complement,
   district:address.district,city:address.city,state_code:address.state_code,
   is_default:address.is_default
  }:{...empty,is_default:items.length===0});
  setError('');setMessage('');
 }
 function update(field:keyof AddressFields,value:string|boolean){
  if(field==='postal_code'){
   resetZip();
   setMessage('');
  }
  setFields(old=>({...old,[field]:value}));
 }
 function findZip(){
  const zip=onlyDigits(fields.postal_code,8);
  if(zip.length!==8)return;
  lastRequestedZip.current=zip;
  void lookupZip(zip);
 }
 async function save(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(busy)return;setBusy(true);setError('');setMessage('');
  try{
   const params={
    p_id:editing||null,p_recipient:fields.recipient.trim(),
    p_phone:fields.phone,p_postal_code:fields.postal_code,
    p_street:fields.street.trim(),p_house_number:fields.house_number.trim(),
    p_complement:fields.complement.trim(),p_district:fields.district.trim(),
    p_city:fields.city.trim(),p_state_code:fields.state_code,
    p_default:fields.is_default
   };
   const {error:saveError}=await createClient().rpc('save_customer_address',params);
   if(saveError)throw saveError;
   setEditing(undefined);setMessage('Endereço salvo com sucesso.');router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Falha ao salvar endereço.');}
  finally{setBusy(false);}
 }
 async function remove(address:CustomerAddress){
  if(busy||!window.confirm('Remover este endereço dos seus endereços ativos?'))return;
  setBusy(true);setError('');setMessage('');
  try{
   const {error:removeError}=await createClient().rpc('archive_customer_address',{p_id:address.id});
   if(removeError)throw removeError;
   setMessage('Endereço removido da lista.');router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível remover o endereço.');}
  finally{setBusy(false);}
 }
 const edit=editing!==undefined;
 return <div className="pope-address-manager">
  {zipError?<p role="alert" className="form-error">{zipError} Você também pode preencher o endereço manualmente.</p>:null}
  {message?<p role="status" className="form-success">{message}</p>:null}
  {error?<p role="alert" className="form-error">{error}</p>:null}
  <div className="pope-address-toolbar">
   <strong>{items.length} de 10 endereços cadastrados</strong>
   <button type="button" className="admin-primary" onClick={()=>start()}
    disabled={busy||edit||items.length>=10}><Plus size={16}/> Novo endereço</button>
  </div>
  <div className="pope-address-grid">
   {items.map(address=><article className="pope-address-card" key={address.id}>
    <div className="pope-address-card-top"><span><House size={20}/> {address.recipient}</span>
     {address.is_default?<b className="pope-address-default"><CheckCircle2 size={14}/> Principal</b>:null}</div>
    <p>{address.street}, {address.house_number}{address.complement?', '+address.complement:''}</p>
    <p>{address.district} · {address.city}/{address.state_code} · {formatZip(address.postal_code)}</p>
    <p className="pope-address-phone"><Phone size={15}/> {address.phone}</p>
    <div className="pope-address-card-actions">
     <button type="button" className="admin-outline" disabled={busy||edit}
      onClick={()=>start(address)}><Edit2 size={15}/> Editar</button>
     <button type="button" className="admin-outline" disabled={busy||edit}
      onClick={()=>remove(address)}><Trash2 size={15}/> Remover</button>
    </div>
   </article>)}
   {items.length===0?<div className="pope-address-empty"><MapPin size={34}/>
    <h3>Você ainda não tem endereços</h3><p>Cadastre um endereço para facilitar a futura finalização dos pedidos.</p>
   </div>:null}
  </div>
  {edit?<form className="pope-address-form" onSubmit={save}>
   <div className="pope-address-form-top"><h2>{editing?'Editar endereço':'Novo endereço'}</h2>
    <button type="button" onClick={()=>setEditing(undefined)} aria-label="Fechar formulário"><X size={21}/></button></div>
   <div className="pope-address-form-grid">
    <label className="wide">Nome de quem receberá<input required minLength={2} maxLength={120}
     value={fields.recipient} onChange={e=>update('recipient',e.target.value)} autoComplete="name"/></label>
    <label>Telefone com DDD<PhoneInput required value={fields.phone}
     onValueChange={value=>update('phone',value)} autoComplete="tel" aria-label="Telefone com DDD"/></label>
    <label>CEP
     <div className="pope-address-zip-row">
      <CepInput required value={fields.postal_code}
       onValueChange={value=>update('postal_code',value)}
       autoComplete="postal-code" aria-label="CEP"/>
      <button type="button" className="admin-outline"
       onClick={findZip} disabled={zipBusy||onlyDigits(fields.postal_code).length!==8}>
       {zipBusy?'Buscando...':'Buscar CEP'}
      </button>
     </div>
     <small className="pope-address-zip-helper">{zipBusy?'Consultando endereço...':
      'O endereço é preenchido automaticamente quando o CEP estiver completo.'}</small>
    </label>
    <label className="wide">Rua / avenida<input required minLength={4} maxLength={120} value={fields.street}
     onChange={e=>update('street',e.target.value)} autoComplete="address-line1"/></label>
    <label>Número<input required maxLength={20} value={fields.house_number}
     onChange={e=>update('house_number',e.target.value)}/></label>
    <label>Complemento (opcional)<input maxLength={120} value={fields.complement}
     onChange={e=>update('complement',e.target.value)} autoComplete="address-line2"/></label>
    <label>Bairro<input required minLength={2} maxLength={80} value={fields.district}
     onChange={e=>update('district',e.target.value)}/></label>
    <label>Cidade<input required minLength={2} maxLength={80} value={fields.city}
     onChange={e=>update('city',e.target.value)} autoComplete="address-level2"/></label>
    <label>Estado (UF)<select required value={fields.state_code}
     onChange={e=>update('state_code',e.target.value)} autoComplete="address-level1">
     {BRAZIL_STATES.map(state=><option value={state} key={state}>{state}</option>)}
    </select></label>
    <label className="pope-address-check wide"><input type="checkbox" checked={fields.is_default}
     onChange={e=>update('is_default',e.target.checked)}/> Usar como meu endereço principal</label>
   </div>
   <p className="pope-address-privacy"><ShieldCheck size={15}/> O endereço é usado somente para organização do cadastro e futuras entregas.</p>
   <div className="pope-address-buttons">
    <button type="button" className="admin-outline" onClick={()=>setEditing(undefined)} disabled={busy}>Cancelar</button>
    <button type="submit" className="admin-primary" disabled={busy}>
     <Save size={17}/>{busy?'Salvando...':'Salvar endereço'}</button>
   </div>
  </form>:null}
 </div>;
}
