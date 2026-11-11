'use client';
import {useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import {AlertTriangle,MailCheck,RefreshCcw,Send,Search} from 'lucide-react';
import type {NotificationRow,NotificationStatus} from '@/types/notifications';
import {NOTIFICATION_LABELS} from '@/types/notifications';
import {dateTimeBR} from '@/types/operations';

export function NotificationManager({rows,smtpReady}:{rows:NotificationRow[];smtpReady:boolean}){
 const router=useRouter(),[filter,setFilter]=useState('todos'),[query,setQuery]=useState('');
 const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const visible=useMemo(()=>rows.filter(n=>(filter==='todos'||n.status===filter)&&
  (!query||[n.order_id,n.recipient_email,n.recipient_name,n.event_type].join(' ').toLowerCase().includes(query.toLowerCase()))),[rows,filter,query]);
 async function operate(action:'process'|'retry',notificationId?:string){
  if(busy)return;setBusy(notificationId??'all');setError('');setNotice('');
  try{
   const response=await fetch('/api/admin/order-notifications',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action,notificationId:notificationId??null})
   });
   const body=await response.json();
   if(!response.ok)throw new Error(body.error||'Não foi possível processar a fila');
   setNotice(body.notice||'Fila processada. Atualize para consultar o resultado.');
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Falha de comunicação com o servidor.');}
  finally{setBusy(null);}
 }
 return <>
  <div className="admin-filterbar"><label className="admin-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)}
    placeholder="Buscar pedido, nome ou e-mail"/></label>
   <select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filtrar notificações">
    <option value="todos">Todas</option><option value="pending">Pendentes</option><option value="sending">Em processamento</option>
    <option value="sent">Enviadas</option><option value="failed">Com falha</option></select>
   <button type="button" className="admin-primary" disabled={!!busy||!smtpReady}
    onClick={()=>operate('process')}><Send size={16}/>{busy==='all'?'Enviando...':'Processar fila (até 3)'}</button></div>
  {notice?<p role="status" className="form-success">{notice}</p>:null}
  {error?<p role="alert" className="form-error">{error}</p>:null}
  <div className="ops-table-scroll"><table className="ops-table">
   <thead><tr><th>Data</th><th>Pedido</th><th>Cliente / E-mail</th><th>Tipo de mensagem</th><th>Status</th><th>Tentativas</th><th>Ações</th></tr></thead>
   <tbody>{visible.map(n=><tr key={n.id}>
    <td>{dateTimeBR(n.created_at)}</td>
    <td><strong>#{n.order_id.slice(0,8).toUpperCase()}</strong></td>
    <td><strong>{n.recipient_name||'Cliente'}</strong><small>{n.recipient_email}</small></td>
    <td>{NOTIFICATION_LABELS[n.event_type]??n.event_type}</td>
    <td><span className={'ops-tag status-'+(n.status==='sent'?'paid':n.status==='failed'?'cancelled':n.status==='pending'?'pending':'packing')}>
     {n.status==='sent'?'Enviado':n.status==='failed'?'Falhou':n.status==='sending'?'Em processamento':'Pendente'}</span>
     {n.sent_at?<small>Enviado em {dateTimeBR(n.sent_at)}</small>:null}
     {n.error_message?<small className="notification-error">{n.error_message}</small>:null}
    </td>
    <td>{n.attempts}</td>
    <td>{n.status==='failed'?<button type="button" className="ops-small primary" disabled={!!busy||!smtpReady}
     onClick={()=>operate('retry',n.id)}><RefreshCcw size={15}/> Reenviar</button>:
     n.status==='pending'?<button type="button" className="ops-small primary" disabled={!!busy||!smtpReady}
     onClick={()=>operate('process',n.id)}><Send size={15}/> Enviar</button>:
     <span className="ops-muted">{n.status==='sent'?'Concluído':'Aguardando'}</span>}
    </td>
   </tr>)}</tbody>
  </table>
  {visible.length===0?<div className="admin-empty"><MailCheck size={34}/><h3>Nenhuma notificação neste filtro</h3>
   <p>As mensagens de clientes são criadas quando um pedido interno muda de status.</p></div>:null}
  </div>
  <p className="admin-help notification-footer"><AlertTriangle size={16}/>
   O reenvio manual está disponível somente para mensagens com falha; mensagens já enviadas não podem ser duplicadas pela interface.
   A entrega final depende do servidor de e-mail e da caixa do destinatário.</p>
 </>;
}
