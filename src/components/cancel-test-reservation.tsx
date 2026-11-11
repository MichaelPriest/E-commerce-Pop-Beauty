'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {XCircle} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
export function CancelTestReservation({orderId}:{orderId:string}){
 const router=useRouter(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function cancel(){
  if(busy||!window.confirm('Cancelar a reserva de homologação e liberar as unidades no estoque?'))return;
  setBusy(true);setError('');
  try{
   const {error:rpcError}=await createClient().rpc('cancel_checkout_order',{p_order_id:orderId});
   if(rpcError)throw rpcError;
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Falha ao cancelar reserva.');}
  finally{setBusy(false);}
 }
 return <span className="pope-reserve-cancel">
  <button type="button" className="admin-outline" onClick={cancel} disabled={busy}>
   <XCircle size={15}/>{busy?'Cancelando...':'Cancelar teste'}</button>
  {error?<small role="alert" className="form-error">{error}</small>:null}
 </span>;
}
