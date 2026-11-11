'use client';
import {useMemo,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {PackageCheck,Truck,Search,Clock,CheckCircle2,PackageOpen,X,Send,FileText,ClipboardList,Boxes} from 'lucide-react';
import {MailCheck} from 'lucide-react';
import {ORDER_LABELS,dateTimeBR,type OrderRow,type OrderStatus} from '@/types/operations';
import {formatBRL} from '@/lib/products';
type Props={orders:OrderRow[]};
export function LogisticsManager({orders}:Props){
 const router=useRouter(),[query,setQuery]=useState(''),[stage,setStage]=useState('todos');
 const [editing,setEditing]=useState<{order:OrderRow;next:OrderStatus}|null>(null);
 const [carrier,setCarrier]=useState(''),[tracking,setTracking]=useState(''),[note,setNote]=useState('');
 const [selected,setSelected]=useState<string[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const shown=useMemo(()=>orders.filter(o=>(stage==='todos'||o.status===stage)&&
  (!query||[o.id,o.carrier??'',o.tracking_code??'',...(o.order_items??[]).map(i=>i.sku_snapshot)].join(' ').toLowerCase().includes(query.toLowerCase()))),[orders,stage,query]);
 const selectable=shown.filter(o=>o.origin==='admin_manual').map(o=>o.id);
 const batchIds=selected.filter(id=>selectable.includes(id)).slice(0,30);
 const manifestUrl='/admin/logistica/romaneio?pedidos='+encodeURIComponent(batchIds.join(','));
 const stats={paid:orders.filter(o=>o.status==='paid').length,packing:orders.filter(o=>o.status==='packing').length,
  shipped:orders.filter(o=>o.status==='shipped').length,delivered:orders.filter(o=>o.status==='delivered').length};
 function open(order:OrderRow,next:OrderStatus){setEditing({order,next});setCarrier('');setTracking('');setNote('');setError('');setNotice('');}
 async function submit(e:FormEvent){
  e.preventDefault();if(!editing||busy)return;setBusy(true);setError('');
  try{
   const response=await fetch('/api/admin/order-operations',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'transition',orderId:editing.order.id,nextStatus:editing.next,
     note:note||null,carrier:carrier||null,tracking:tracking||null})
   });
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||'Falha ao atualizar expedição');
   setEditing(null);setNotice('Expedição registrada. '+(result.email?.notice||'Verifique a fila de e-mails.'));
   router.refresh();
  }catch(err){setError(err instanceof Error?err.message:'Não foi possível atualizar a expedição.');}
  finally{setBusy(false);}
 }
 return <div className="container admin-workspace">
  <div className="admin-top"><div><div className="section-kicker">EXPEDIÇÃO • POPÊ BEAUTY</div><h1>Logística e entregas 🚚</h1><p>Acompanhe separação, envio e confirmação de entrega dos pedidos internos.</p></div><div className="admin-adult-controls"><Link className="admin-outline" href="/admin/notificacoes"><MailCheck size={17}/> E-mails</Link><Link className="admin-outline" href="/admin/pedidos"><PackageOpen size={17}/> Voltar aos pedidos</Link><Link className="admin-outline" href="/admin/fiscal"><FileText size={17}/> Fiscal e etiquetas</Link></div></div>
  <div className="admin-metric-row"><div><Clock/><small>Pagos aguardando separação</small><strong>{stats.paid}</strong></div>
  <div><PackageOpen/><small>Em separação</small><strong>{stats.packing}</strong></div>
  <div><Truck/><small>Enviados</small><strong>{stats.shipped}</strong></div>
  <div><PackageCheck/><small>Entregues</small><strong>{stats.delivered}</strong></div></div>
  <p className="ops-info"><Truck size={17}/> Rastreio inserido manualmente. Frete, emissão de etiquetas e consulta de transportadoras ainda não estão conectados a provedores externos.</p>
  <div className="admin-filterbar"><label className="admin-search"><Search size={17}/><input placeholder="Localizar pedido, rastreamento ou SKU" value={query} onChange={e=>setQuery(e.target.value)}/></label>
   <select value={stage} onChange={e=>setStage(e.target.value)}><option value="todos">Todos os estágios</option><option value="paid">Pago</option><option value="packing">Separação</option><option value="shipped">Enviado</option><option value="delivered">Entregue</option></select></div>
  <div className="admin-adult-controls" style={{margin:'12px 0',flexWrap:'wrap'}}>
   <button type="button" className="admin-outline" onClick={()=>setSelected(selectable.slice(0,30))} disabled={!selectable.length}>Selecionar até 30 pedidos</button>
   <button type="button" className="admin-outline" onClick={()=>setSelected([])} disabled={!selected.length}>Limpar seleção</button>
   {batchIds.length?<Link className="admin-primary" href={manifestUrl} target="_blank" rel="noopener noreferrer"><ClipboardList size={17}/> Romaneio interno ({batchIds.length})</Link>:null}
   <small className="ops-muted">Romaneio somente para conferência; não registra despacho.</small>
  </div>
  {notice?<p role="status" className="form-success">{notice}</p>:null}
  <div className="ops-table-scroll"><table className="ops-table"><thead><tr><th>Selecionar</th><th>Pedido</th><th>Itens</th><th>Total</th><th>Transportadora / Rastreio</th><th>Status</th><th>Ação</th></tr></thead>
   <tbody>{shown.map(o=><tr key={o.id}><td>{o.origin==='admin_manual'?<input type="checkbox" aria-label={'Selecionar pedido '+o.id.slice(0,8)} checked={selected.includes(o.id)} disabled={!selected.includes(o.id)&&selected.length>=30} onChange={e=>setSelected(old=>e.target.checked?[...old,o.id].slice(0,30):old.filter(id=>id!==o.id))}/>:null}</td><td><strong>#{o.id.slice(0,8).toUpperCase()}</strong><small>{dateTimeBR(o.created_at)}</small></td>
    <td>{o.order_items?.reduce((a,i)=>a+i.quantity,0)??0} unidades</td>
    <td>{formatBRL(o.total_cents)}</td>
    <td>{o.tracking_code?<><strong>{o.carrier}</strong><small>{o.tracking_code}</small></>:'Não despachado'}</td>
    <td><span className={'ops-tag status-'+o.status}>{ORDER_LABELS[o.status]??o.status}</span></td>
    <td>{o.origin!=='admin_manual'?<span className="ops-muted">Somente consulta</span>:<div style={{display:'flex',gap:6,flexWrap:'wrap'}}><Link className="ops-small" href={'/admin/logistica/volumes/'+o.id}><Boxes size={15}/> Volumes</Link>
     {o.status==='paid'?<button className="ops-small primary" onClick={()=>open(o,'packing')}><PackageOpen size={15}/> Iniciar separação</button>:
     o.status==='packing'?<button className="ops-small primary" onClick={()=>open(o,'shipped')}><Send size={15}/> Registrar envio</button>:
     o.status==='shipped'?<button className="ops-small primary" onClick={()=>open(o,'delivered')}><CheckCircle2 size={15}/> Marcar entregue</button>:
     <span className="ops-muted">Finalizado</span>}</div>}</td></tr>)}</tbody></table>
   {shown.length===0?<div className="admin-empty"><Truck size={35}/><h3>Nenhuma entrega neste filtro</h3><p>Pedidos pagos internamente aparecerão aqui para separação e despacho.</p></div>:null}
  </div>
  {editing?<div className="admin-modal-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setEditing(null);}}>
   <section className="admin-modal smaller" role="dialog" aria-modal="true" aria-label="Atualizar expedição">
    <div className="admin-modal-header"><div><div className="section-kicker">PEDIDO #{editing.order.id.slice(0,8).toUpperCase()}</div><h2>{ORDER_LABELS[editing.next]}</h2></div><button aria-label="Fechar" onClick={()=>setEditing(null)} disabled={busy}><X/></button></div>
    <form className="admin-form" onSubmit={submit}><p className="admin-help">{editing.next==='shipped'?'A baixa de estoque será realizada por lote, priorizando validade próxima. Informe dados reais da remessa.':'Registre esta etapa somente depois de ela ocorrer efetivamente.'}</p>
     <div className="admin-form-grid">{editing.next==='shipped'?<>
       <label>Transportadora *<input required maxLength={90} value={carrier} onChange={e=>setCarrier(e.target.value)} placeholder="Correios, entrega própria..."/></label>
       <label>Rastreio *<input required maxLength={120} value={tracking} onChange={e=>setTracking(e.target.value)}/></label></>:null}
       <label className="full">Observação<input value={note} maxLength={500} onChange={e=>setNote(e.target.value)} placeholder="Opcional"/></label>
     </div>
     {error?<p className="form-error" role="alert">{error}</p>:null}
     <div className="admin-form-footer"><button type="button" className="admin-outline" disabled={busy} onClick={()=>setEditing(null)}>Cancelar</button>
      <button className="admin-primary" disabled={busy} type="submit">{busy?'Salvando...':'Confirmar '+ORDER_LABELS[editing.next]}</button></div>
    </form></section></div>:null}
 </div>;
}
