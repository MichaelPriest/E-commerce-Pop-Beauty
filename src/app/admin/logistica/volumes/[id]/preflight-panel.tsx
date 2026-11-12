'use client';
import {useState,type FormEvent} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ClipboardCheck,ShieldAlert} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';

export type PurchasePreflightRow={
 id:string;request_id:string;intent_key:string;source_fingerprint:string;review_key:string;
 recipient_checked:boolean;packages_checked:boolean;payment_checked:boolean;
 fiscal_checked:boolean;carrier_terms_checked:boolean;
 checklist_complete_internal:boolean;review_notes:string|null;reviewed_at:string
};
type CheckKey='recipient_checked'|'packages_checked'|'payment_checked'|
 'fiscal_checked'|'carrier_terms_checked';
const checks:{key:CheckKey;label:string;detail:string}[]=[
 {key:'recipient_checked',label:'Destinatário e endereço conferidos',
  detail:'Compare os dados do pedido com as informações necessárias ao transportador.'},
 {key:'packages_checked',label:'Quantidade, peso e dimensões dos volumes conferidos',
  detail:'Verifique os volumes reais e a embalagem antes de qualquer contratação.'},
 {key:'payment_checked',label:'Conferência administrativa do pagamento',
  detail:'Esta marcação não é confirmação de liquidação do gateway ou recebimento bancário.'},
 {key:'fiscal_checked',label:'Preparação fiscal conferida manualmente',
  detail:'Exige cadastro do emitente, destinatário e rascunho; NÃO significa NF-e autorizada pela SEFAZ.'},
 {key:'carrier_terms_checked',label:'Condições e restrições do serviço conferidas',
  detail:'Cotação de sandbox NÃO vale como preço comercial ou reserva de coleta.'}
];
type Props={
 requestId:string|null;editable:boolean;
 intentCurrent:boolean;hasProviderEvidence:boolean;hasCancellationPending:boolean;
 previous:PurchasePreflightRow|null;
};
export function ShipmentPurchasePreflight({
 requestId,editable,intentCurrent,hasProviderEvidence,hasCancellationPending,previous
}:Props){
 const router=useRouter();
 const [fields,setFields]=useState<Record<CheckKey,boolean>>({
  recipient_checked:previous?.recipient_checked??false,
  packages_checked:previous?.packages_checked??false,
  payment_checked:previous?.payment_checked??false,
  fiscal_checked:previous?.fiscal_checked??false,
  carrier_terms_checked:previous?.carrier_terms_checked??false
 });
 const [notes,setNotes]=useState(previous?.review_notes??'');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState(''),[error,setError]=useState('');
 const count=checks.filter(check=>fields[check.key]).length;
 const canSave=Boolean(editable&&requestId&&intentCurrent&&!hasProviderEvidence&&!hasCancellationPending&&!busy);
 async function save(event:FormEvent){
  event.preventDefault();
  if(!canSave||!requestId)return;
  setBusy(true);setMessage('');setError('');
  try{
   const {data,error:rpcError}=await createClient().rpc('save_shipment_purchase_preflight',{
    p_request_id:requestId,
    p_recipient_checked:fields.recipient_checked,
    p_packages_checked:fields.packages_checked,
    p_payment_checked:fields.payment_checked,
    p_fiscal_checked:fields.fiscal_checked,
    p_carrier_terms_checked:fields.carrier_terms_checked,
    p_review_notes:notes.trim()||null
   });
   if(rpcError)throw rpcError;
   setMessage(data?.changed?
    'Checklist interno salvo e auditado. A contratação de frete continua bloqueada.':
    'Nenhuma mudança detectada; não foi criada outra revisão.');
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Erro ao salvar a conferência.');}
  finally{setBusy(false);}
 }
 return <section className="ops-form-card">
  <h2><ClipboardCheck size={20}/> Checklist antes de contratar frete</h2>
  <p className="admin-help">Revisão administrativa versionada, independente dos dados de
   sandbox. Mesmo com todos os itens marcados, <strong>NÃO existe autorização de
   compra de etiqueta</strong> ou geração de objeto postal neste sistema.</p>
  <div className="admin-metric-row">
   <div><ClipboardCheck/><small>Itens marcados</small><strong>{count} / 5</strong></div>
   <div><ShieldAlert/><small>Liberação para compra externa</small><strong>Bloqueada</strong></div>
  </div>
  {previous?<p className="admin-help">
   Última revisão #{previous.review_key.slice(0,8).toUpperCase()}
   {' · '} {new Date(previous.reviewed_at).toLocaleString('pt-BR')}
   {' · '} {previous.checklist_complete_internal?
    'Conferência interna completa (sem autorização comercial)':'Conferência interna incompleta'}
  </p>:null}
  <form className="admin-form" onSubmit={save}>
   {checks.map(check=><label key={check.key} style={{
    display:'flex',alignItems:'flex-start',gap:10,marginBottom:14
   }}>
    <input type="checkbox" checked={fields[check.key]} disabled={!canSave}
     onChange={event=>setFields(current=>({...current,[check.key]:event.target.checked}))}/>
    <span><strong>{check.label}</strong><small style={{display:'block',marginTop:3}}>
     {check.detail}</small></span>
   </label>)}
   <label>Observações da conferência (opcional, sem dados pessoais)
    <textarea value={notes} onChange={event=>setNotes(event.target.value)}
     maxLength={400} rows={2} disabled={!canSave}
     placeholder="Registre pendências para a equipe; evite CPF, endereço e telefone"/>
   </label>
   <div className="admin-form-footer">
    <button type="submit" className="admin-primary" disabled={!canSave}>
     {busy?'Salvando...':'Salvar checklist interno'}</button>
    <Link href="/admin/fiscal" className="admin-outline">
     Conferir preparação fiscal</Link>
   </div>
  </form>
  {!requestId?<p className="admin-help">Antes de preencher, registre uma solicitação
   interna para a versão atual da remessa.</p>:null}
  {!intentCurrent&&requestId?<p className="form-error">
   Intenção obsoleta: os dados da remessa mudaram. Registre uma nova intenção e solicitação.</p>:null}
  {hasProviderEvidence?<p className="admin-help">Bloqueado: já existem evidências externas.
   Não se altera um checklist pré-compra após receber documentos ou rastreio.</p>:null}
  {hasCancellationPending?<p className="admin-help">Existe uma revisão de cancelamento
   em andamento. A conferência de pré-compra está bloqueada.</p>:null}
  {error?<p className="form-error" role="alert">{error}</p>:null}
  {message?<p className="form-success" role="status">{message}</p>:null}
  <p className="admin-help">Qualquer mudança de endereço, itens, serviço ou volumes exige
   nova intenção e checklist. O backend revalida o pedido antes de gravar e mantém
   a compra de frete, emissão fiscal e postagem permanentemente desativadas nesta fase.</p>
 </section>;
}
