'use client';
import {useMemo,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {CheckCircle2,Search,Save,Headset,Package} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {dateTimeBR} from '@/types/operations';
import {
 SERVICE_CATEGORIES,SERVICE_STATUSES,serviceStatusLabel,
 type ServiceRequest,type ServiceStatus
} from '@/lib/customer-service';

export function AdminServiceManager({requests,customerNames}:{
 requests:ServiceRequest[];customerNames:Record<string,string|null>;
}){
 const router=useRouter();
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('pending');
 const [editing,setEditing]=useState<ServiceRequest|null>(null);
 const [status,setStatus]=useState<ServiceStatus>('in_review'),[note,setNote]=useState('');
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const openCount=requests.filter(r=>r.status==='open'||r.status==='in_review').length;
 const visible=useMemo(()=>requests.filter(r=>{
  if(filter==='pending'&&!['open','in_review'].includes(r.status))return false;
  if(filter!=='pending'&&filter!=='all'&&r.status!==filter)return false;
  const text=[r.subject,r.description,r.id,r.order_id??'',
   customerNames[r.user_id]??'',r.user_id].join(' ').toLocaleLowerCase('pt-BR');
  return text.includes(query.trim().toLocaleLowerCase('pt-BR'));
 }),[requests,filter,query,customerNames]);
 function edit(request:ServiceRequest){
  setEditing(request);setStatus(request.status);setNote(request.admin_note??'');
  setError('');setNotice('');
 }
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!editing||saving)return;
  if(['resolved','closed'].includes(status)&&note.trim().length<10){
   setError('Para responder ou encerrar, informe uma resposta com ao menos 10 caracteres.');return;
  }
  if(note.length>1200){setError('Resposta acima de 1.200 caracteres.');return;}
  setSaving(true);setError('');setNotice('');
  try{
   const {data,error:dbError}=await createClient().from('customer_service_requests')
    .update({status,admin_note:note.trim()||null})
    .eq('id',editing.id).eq('updated_at',editing.updated_at).select('id').maybeSingle();
   if(dbError)throw new Error('Não foi possível atualizar o atendimento.');
   if(!data)throw new Error('A solicitação mudou em outra sessão. Atualize a fila para continuar.');
   setNotice('Atendimento atualizado. O cliente já pode consultar o resultado na conta.');
   setEditing(null);router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar.');}
  finally{setSaving(false);}
 }
 return <>
  <div className="pope-admin-service-overview">
   <div><small>Solicitações recentes</small><strong>{requests.length}</strong></div>
   <div><small>Aguardando análise ou resposta</small><strong>{openCount}</strong></div>
   <div><small>Respondidas</small>
    <strong>{requests.filter(r=>r.status==='resolved').length}</strong></div>
  </div>
  <div className="pope-support-alert">
   <Headset size={19}/><span>Este módulo registra atendimento e decisões da equipe.
    Cancelamentos, reembolsos, etiquetas de devolução e documentos fiscais
    são tratados nos módulos operacionais apropriados.</span>
  </div>
  <div className="admin-filterbar">
   <label className="admin-search"><Search size={17}/>
    <input value={query} onChange={e=>setQuery(e.target.value)}
     placeholder="Buscar cliente, pedido, assunto ou protocolo" aria-label="Pesquisar solicitações"/>
   </label>
   <select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filtrar situação">
    <option value="pending">Pendentes de atendimento</option>
    <option value="all">Todas</option>
    {(Object.entries(SERVICE_STATUSES) as [ServiceStatus,string][])
     .map(([value,label])=><option key={value} value={value}>{label}</option>)}
   </select>
  </div>
  {notice?<p className="form-success" role="status"><CheckCircle2 size={17}/>{notice}</p>:null}
  {error&&!editing?<p className="form-error" role="alert">{error}</p>:null}
  {visible.length?<div className="pope-admin-service-list">
   {visible.map(r=><article key={r.id} className="pope-admin-service-ticket">
    <div className="pope-support-ticket-top">
     <div><small>{SERVICE_CATEGORIES[r.category]} · #{r.id.slice(0,8).toUpperCase()}</small>
      <h2>{r.subject}</h2>
      <small>{dateTimeBR(r.created_at)} · {customerNames[r.user_id]||'Cliente cadastrado'} · #{r.user_id.slice(0,8)}</small>
     </div>
     <span className="order-status" data-status={r.status}>{serviceStatusLabel(r.status)}</span>
    </div>
    {r.order_id?<p className="pope-support-linked-order">
     <Package size={15}/>
     <Link href={'/admin/pedidos/'+r.order_id}>
      Ver pedido #{r.order_id.slice(0,8).toUpperCase()}</Link>
    </p>:null}
    <p className="pope-admin-service-description">{r.description}</p>
    {r.admin_note?<p className="pope-support-reply">
     <strong>Resposta registrada</strong><span>{r.admin_note}</span></p>:null}
    <button className="admin-outline" type="button" onClick={()=>edit(r)}>
     {r.status==='closed'?'Revisar atendimento':'Responder / atualizar'}</button>
   </article>)}
  </div>:<div className="admin-empty"><Headset size={31}/>
   <h3>Nenhuma solicitação para este filtro</h3>
   <p>Altere os filtros ou aguarde novas mensagens dos clientes.</p></div>}
  {editing?<div className="admin-modal-overlay" role="presentation"
   onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setEditing(null);}}>
   <section className="admin-modal smaller" role="dialog" aria-modal="true"
    aria-label={'Responder solicitação '+editing.subject}>
    <div className="admin-modal-header">
     <div><span className="section-kicker">ATENDIMENTO #{editing.id.slice(0,8).toUpperCase()}</span>
      <h2>Responder cliente</h2></div>
     <button type="button" onClick={()=>setEditing(null)} disabled={saving}
      aria-label="Fechar">×</button>
    </div>
    <form className="admin-form" onSubmit={save}>
     <label>Situação do atendimento
      <select value={status} disabled={saving}
       onChange={e=>setStatus(e.target.value as ServiceStatus)}>
       {(Object.entries(SERVICE_STATUSES) as [ServiceStatus,string][])
        .map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select>
     </label>
     <label>Resposta visível ao cliente
      <textarea value={note} rows={6} maxLength={1200} disabled={saving}
       onChange={e=>setNote(e.target.value)}
       placeholder="Informe o resultado da análise e as próximas orientações."/>
     </label>
     <p className="admin-help">Para marcar como respondida ou encerrada, a resposta
      é obrigatória. Esta ação não realiza reembolso ou movimenta estoque.</p>
     {error?<p className="form-error" role="alert">{error}</p>:null}
     <div className="admin-form-footer">
      <button type="button" className="admin-outline" disabled={saving}
       onClick={()=>setEditing(null)}>Cancelar</button>
      <button type="submit" className="admin-primary" disabled={saving}>
       <Save size={16}/>{saving?'Salvando...':'Salvar atendimento'}</button>
     </div>
    </form>
   </section>
  </div>:null}
 </>;
}
