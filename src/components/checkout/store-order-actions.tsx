'use client';
import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {createClient} from '@/lib/supabase/browser';

export function StoreOrderActions({orderId,pay,cancel}:{orderId:string;pay:boolean;cancel:boolean}){
 const router=useRouter();
 const [reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function run(event:FormEvent,action:'pay'|'cancel'){
  event.preventDefault();
  if(busy)return;
  setBusy(true);setError('');
  try{
   if(action==='cancel'){
    const {error}=await createClient().rpc('request_store_order_cancel',{p_order_id:orderId,p_reason:reason});
    if(error)throw new Error(error.message);
    router.refresh();
   }else{
    const res=await fetch('/api/checkout/order',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({action:'payment',order_id:orderId})});
    const data=await res.json();
    if(!res.ok||!data.checkout_url)throw new Error(data.error??'Pagamento indisponível.');
    window.location.assign(data.checkout_url);
   }
  }catch(e){setError(e instanceof Error?e.message:'A operação não pôde ser concluída.');}
  finally{setBusy(false);}
 }
 return <div className="admin-form">
  {pay&&<form onSubmit={e=>void run(e,'pay')}><button className="admin-primary" disabled={busy}>Continuar pagamento</button></form>}
  {cancel&&<details><summary>Solicitar cancelamento</summary>
   <form className="admin-form" onSubmit={e=>void run(e,'cancel')}>
    <label>Motivo<input required minLength={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
    <div><button className="admin-outline" disabled={busy}>Solicitar cancelamento</button></div>
   </form>
  </details>}
  {error&&<p className="form-error" role="alert">{error}</p>}
 </div>;
}
