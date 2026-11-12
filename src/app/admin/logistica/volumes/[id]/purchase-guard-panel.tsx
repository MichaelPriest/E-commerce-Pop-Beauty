'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {ShieldCheck,ShieldAlert} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';

export type PurchaseGuardRow={
 guard_key:string;guard_revision:number;request_id:string;
 intent_key:string;source_fingerprint:string;preflight_review_key:string;
 provider:string;status:string;updated_at:string
};
type Props={
 requestId:string|null;preflightKey:string|null;preflightComplete:boolean;
 intentCurrent:boolean;editable:boolean;
 hasProviderEvidence:boolean;hasCancellationPending:boolean;
 guard:PurchaseGuardRow|null;
};
export function PurchaseGuardPanel({
 requestId,preflightKey,preflightComplete,intentCurrent,editable,
 hasProviderEvidence,hasCancellationPending,guard
}:Props){
 const router=useRouter();
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const current=Boolean(
  guard&&requestId&&preflightKey&&
  guard.request_id===requestId&&guard.preflight_review_key===preflightKey
 );
 const canReserve=Boolean(requestId&&preflightKey&&preflightComplete&&
  intentCurrent&&editable&&!hasProviderEvidence&&!hasCancellationPending&&!busy);
 async function reserve(){
  if(!canReserve||!requestId||!preflightKey)return;
  setBusy(true);setError('');setNotice('');
  try{
   const {data,error:rpcError}=await createClient().rpc('reserve_shipment_purchase_guard',{
    p_request_id:requestId,p_review_key:preflightKey
   });
   if(rpcError)throw rpcError;
   setNotice(data?.changed?
    'Identidade técnica interna registrada. Nenhuma compra foi enviada ao provedor.':
    'A identidade existente foi preservada; nenhuma duplicação de registro.');
   router.refresh();
  }catch(e){
   setError(e instanceof Error?e.message:'Falha ao registrar a chave técnica.');
  }finally{setBusy(false);}
 }
 return <section className="ops-form-card">
  <h2><ShieldCheck size={19}/> Proteção técnica contra duplicidade</h2>
  <p className="admin-help">O pedido terá no máximo uma chave técnica vigente no banco.
   Uma nova versão do checklist substitui essa identidade de modo controlado.
   <strong> A chave é interna e não garante idempotência no Melhor Envio ou nos Correios.</strong></p>
  <div className="admin-metric-row">
   <div><ShieldCheck/><small>Controle interno</small>
    <strong>{current?'Registrado':guard?'Versão anterior':'Pendente'}</strong></div>
   <div><ShieldAlert/><small>Execução externa</small><strong>Desativada</strong></div>
  </div>
  {guard?<p className="admin-help">
   Chave #{guard.guard_key.slice(0,8).toUpperCase()}
   {' · '} Revisão {guard.guard_revision}
   {' · '} {new Date(guard.updated_at).toLocaleString('pt-BR')}
   {current?' · Correspondente ao checklist atual':' · Precisa de nova conferência'}
  </p>:null}
  <div className="admin-form-footer">
   <button type="button" className="admin-outline" disabled={!canReserve} onClick={()=>void reserve()}>
    {busy?'Registrando...':current?'Conferir chave técnica (idempotente)':
     'Registrar chave técnica interna'}
   </button>
  </div>
  {!preflightComplete?<p className="admin-help">
   Conclua primeiro as cinco conferências administrativas no checklist anterior.</p>:null}
  {!intentCurrent&&requestId?<p className="form-error">
   Esta versão da remessa mudou. Atualize a intenção, a solicitação e o checklist.</p>:null}
  {error?<p className="form-error" role="alert">{error}</p>:null}
  {notice?<p className="form-success" role="status">{notice}</p>:null}
  <p className="admin-help">Mesmo após registrar a chave, o banco mantém
   <strong> blocked_homologation</strong> e a compra permanece impossibilitada.
   Na integração futura será obrigatório validar novamente pedido, condição fiscal,
   preço atualizado e o mecanismo de idempotência oferecido pelo parceiro.</p>
 </section>;
}
