'use client';
import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {createClient} from '@/lib/supabase/browser';
import {isShippingProvider,PROVIDERS,type ProviderDraft,
 type ShippingProvider} from '@/lib/shipping/provider-adapters';

type Props={
 orderId:string;editable:boolean;draft:ProviderDraft|null;
 structurallyReady:boolean;
};
export function ShipmentProviderEditor({orderId,editable,draft,structurallyReady}:Props){
 const router=useRouter();
 const [provider,setProvider]=useState<ShippingProvider|string>(draft?.provider??'');
 const [serviceCode,setServiceCode]=useState(draft?.service_code??'');
 const [notes,setNotes]=useState(draft?.operator_notes??'');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const descriptor=isShippingProvider(provider)?PROVIDERS[provider]:null;
 async function submit(event:FormEvent){
  event.preventDefault();
  if(busy||!editable)return;
  if(!isShippingProvider(provider)){setError('Selecione uma transportadora.');return;}
  if(serviceCode.trim()&&!/^[A-Za-z0-9._-]{1,40}$/.test(serviceCode.trim())){
   setError('O código de serviço deve conter até 40 caracteres alfanuméricos, ponto, hífen ou sublinhado.');
   return;
  }
  setBusy(true);setError('');setNotice('');
  try{
   const {error:saveError}=await createClient().rpc('save_shipment_provider_draft',{
    p_order_id:orderId,p_provider:provider,
    p_service_code:serviceCode.trim()||null,p_notes:notes.trim()||null
   });
   if(saveError)throw new Error(saveError.message);
   setNotice('Preferência de transportadora salva como rascunho. Nenhum frete foi comprado.');
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Erro ao salvar transportadora.');}
  finally{setBusy(false);}
 }
 return <section className="ops-form-card">
  <h2>Transportadora e preparação de integração</h2>
  <p className="admin-help">Seleção de fluxo para desenvolvimento. O código de serviço é
   apenas uma referência manual e NÃO está validado por cotação ou contrato.</p>
  <form className="admin-form" onSubmit={submit}>
   <div className="admin-form-grid">
    <label>Transportadora / integrador *
     <select value={provider} disabled={!editable||busy}
      onChange={e=>{setProvider(e.target.value);setServiceCode('');setNotice('');}}>
      <option value="">Selecione...</option>
      <option value="melhor_envio">Melhor Envio</option>
      <option value="correios">Correios — Pré-postagem</option>
     </select>
    </label>
    <label>Código de serviço (opcional, não verificado)
     <input maxLength={40} value={serviceCode} disabled={!editable||busy}
      onChange={e=>setServiceCode(e.target.value)}
      placeholder="Código retornado pelo provedor após cotação"/>
    </label>
    <label className="full">Observações internas
     <textarea maxLength={400} rows={2} disabled={!editable||busy}
      value={notes} onChange={e=>setNotes(e.target.value)}
      placeholder="Conferências ou condições para contratação futura"/>
    </label>
   </div>
   {descriptor?<div className="admin-help">
    <strong>Fluxo previsto para {descriptor.label}:</strong>
    <ol>{descriptor.workflow.map(x=><li key={x}>{x}</li>)}</ol>
    <a href={descriptor.documentation_url} target="_blank" rel="noopener noreferrer">
     Documentação oficial do provedor</a>
   </div>:null}
   {draft?<p className="admin-help">Rascunho salvo: versão {draft.revision}.
    Não há etiqueta, contrato, postagem ou rastreamento gerado.</p>:null}
   {error?<p className="form-error" role="alert">{error}</p>:null}
   {notice?<p className="form-success" role="status">{notice}</p>:null}
   <div className="admin-form-footer">
    <button type="submit" className="admin-primary"
     disabled={!editable||busy||!isShippingProvider(provider)}>
     {busy?'Salvando...':'Salvar integrador (rascunho)'}</button>
    {structurallyReady?<a href={'/api/admin/shipping/preparation/'+orderId}
     className="admin-outline">Exportar pacote de preparação (JSON)</a>:null}
   </div>
   {!editable?<p className="admin-help">Pedido fora da etapa de separação. Alterações bloqueadas.</p>:null}
  </form>
 </section>;
}
