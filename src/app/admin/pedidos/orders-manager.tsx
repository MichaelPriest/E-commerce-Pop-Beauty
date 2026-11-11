'use client';
import {useMemo,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {MailCheck} from 'lucide-react';
import {Boxes,CheckCircle2,Clock,PackagePlus,Search,ShoppingBag,Truck,X,Plus,Trash2,BadgeCheck,History} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {formatBRL} from '@/lib/products';
import {dateTimeBR,ORDER_LABELS,CHANNEL_LABELS,type OrderRow,type SellableSku,type CustomerRow,type OrderStatus} from '@/types/operations';

type Props={orders:OrderRow[];variants:SellableSku[];customers:CustomerRow[]};
type CartLine={key:number;variant_id:string;quantity:string};
const actions:Record<string,{status:OrderStatus,label:string}[]>={
 pending:[{status:'paid',label:'Confirmar recebimento'},{status:'cancelled',label:'Cancelar / liberar reserva'}],
 paid:[{status:'packing',label:'Iniciar separação'}],
 packing:[{status:'shipped',label:'Despachar pedido'}],
 shipped:[{status:'delivered',label:'Confirmar entrega'}]
};
const randomId=()=>Math.floor(Math.random()*1_000_000_000);
export function OrdersManager({orders,variants,customers}:Props){
 const router=useRouter();
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('todos'),[open,setOpen]=useState(false);
 const [buyer,setBuyer]=useState(''),[lines,setLines]=useState<CartLine[]>([{key:randomId(),variant_id:'',quantity:'1'}]);
 const [action,setAction]=useState<{order:OrderRow;next:OrderStatus}|null>(null);
 const [note,setNote]=useState(''),[carrier,setCarrier]=useState(''),[tracking,setTracking]=useState('');
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [expanded,setExpanded]=useState<string|null>(null);
 const sellable=useMemo(()=>variants.filter(v=>v.products?.active&&!v.products?.is_adult),[variants]);
 const clients=useMemo(()=>new Map(customers.map(c=>[c.id,c.display_name])),[customers]);
 const shown=useMemo(()=>orders.filter(o=>
 (filter==='todos'||o.status===filter) &&
 (!query||[o.id,o.tracking_code??'',o.channel,clients.get(o.customer_id??'')??'',
    ...(o.order_items??[]).map(x=>x.sku_snapshot)].join(' ').toLowerCase().includes(query.toLowerCase()))
 ),[orders,filter,query,clients]);
 const stats={all:orders.length,pending:orders.filter(o=>o.status==='pending').length,
  processing:orders.filter(o=>['paid','packing'].includes(o.status)).length,
  shipped:orders.filter(o=>o.status==='shipped').length};
 function resetMessages(){setError('');setNotice('');}
 function startOrder(){setBuyer('');setLines([{key:randomId(),variant_id:'',quantity:'1'}]);resetMessages();setOpen(true);}
 function addLine(){if(lines.length<30)setLines(v=>[...v,{key:randomId(),variant_id:'',quantity:'1'}]);}
 function lineEdit(key:number,patch:Partial<CartLine>){setLines(v=>v.map(item=>item.key===key?{...item,...patch}:item));}
 function lineDelete(key:number){setLines(v=>v.filter(item=>item.key!==key));}
 const estimated=lines.reduce((t,l)=>{const variant=sellable.find(v=>v.id===l.variant_id);return t+(variant?.products?.price_cents??0)*(Number(l.quantity)||0);},0);
 async function submitOrder(e:FormEvent){
  e.preventDefault();if(saving)return;resetMessages();
  if(!lines.length){setError('Adicione pelo menos um SKU.');return;}
  const duplicates=new Set<string>();
  const items=[];
  for(const line of lines){
   if(!line.variant_id){setError('Selecione um SKU para cada item.');return;}
   const n=Number(line.quantity);
   if(!Number.isInteger(n)||n<1||n>99){setError('Quantidade por item precisa estar entre 1 e 99.');return;}
   if(duplicates.has(line.variant_id)){setError('Não repita SKU; aumente a quantidade no mesmo item.');return;}
   duplicates.add(line.variant_id);items.push({variant_id:line.variant_id,quantity:n});
  }
  setSaving(true);
  try{
   const response=await fetch('/api/admin/order-operations',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'create',customerId:buyer||null,items})
   });
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||'Erro ao criar pedido');
   setOpen(false);setNotice('Pedido interno criado e unidades reservadas. '+(result.email?.notice||'Confira o histórico de notificações.'));router.refresh();
  }catch(err){setError(err instanceof Error?err.message:'Não foi possível criar pedido.');}
  finally{setSaving(false);}
 }
 function startAction(order:OrderRow,next:OrderStatus){
  resetMessages();setAction({order,next});setNote('');setCarrier('');setTracking('');
 }
 async function advance(e:FormEvent){
  e.preventDefault();if(!action||saving)return;
  setSaving(true);resetMessages();
  try{
   const response=await fetch('/api/admin/order-operations',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'transition',orderId:action.order.id,nextStatus:action.next,
     note:note||null,carrier:carrier||null,tracking:tracking||null})
   });
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||'Falha ao atualizar pedido');
   const label=ORDER_LABELS[action.next];
   setAction(null);setNotice('Status atualizado: '+label+'. '+(result.email?.notice||'Confira a fila de notificações.'));
   router.refresh();
  }catch(err){setError(err instanceof Error?err.message:'Não foi possível atualizar o pedido.');}
  finally{setSaving(false);}
 }
 return <div className="container admin-workspace">
  <div className="admin-top"><div><div className="section-kicker">OPERAÇÃO • POPÊ BEAUTY</div><h1>Central de pedidos 🛍️</h1>
   <p>Pedidos internos com reservas, confirmações manuais e registro de eventos.</p></div>
   <button type="button" className="admin-primary" onClick={startOrder}><PackagePlus size={17}/> Novo pedido interno</button></div>
  <div className="admin-metric-row"><div><ShoppingBag/><small>Pedidos</small><strong>{stats.all}</strong></div>
   <div><Clock/><small>Aguardando pagamento</small><strong>{stats.pending}</strong></div>
   <div><Boxes/><small>Pagos / separando</small><strong>{stats.processing}</strong></div>
   <div><Truck/><small>Em transporte</small><strong>{stats.shipped}</strong></div></div>
  <p className="ops-info"><BadgeCheck size={18}/> Pedidos nesta área são manuais e administrativos. Não existe cobrança automática, checkout público nem confirmação bancária. A marcação de pagamento exige conferência de comprovante externo.</p>
  <div className="admin-filterbar"><label className="admin-search"><Search size={17}/><input placeholder="Pesquisar código, SKU, cliente ou rastreio" value={query} onChange={e=>setQuery(e.target.value)}/></label>
   <select value={filter} onChange={e=>setFilter(e.target.value)}><option value="todos">Todos os status</option>
    {Object.entries(ORDER_LABELS).map(([code,label])=><option key={code} value={code}>{label}</option>)}</select>
   <Link href="/admin/logistica" className="admin-outline"><Truck size={17}/> Logística</Link>
   <Link href="/admin/notificacoes" className="admin-outline"><MailCheck size={17}/> Notificações</Link></div>
  {notice&&!open&&!action?<p className="form-success" role="status">{notice}</p>:null}
  <div className="ops-table-scroll"><table className="ops-table"><thead><tr><th>Código / Data</th><th>Cliente</th><th>Origem</th><th>Itens</th><th>Total</th><th>Status</th><th>Ações</th></tr></thead>
   <tbody>{shown.map(o=><tr key={o.id}>
    <td><strong>#{o.id.slice(0,8).toUpperCase()}</strong><small>{dateTimeBR(o.created_at)}</small></td>
    <td>{o.customer_id?clients.get(o.customer_id)||'Cliente cadastrado':'Balcão / sem vínculo'}</td>
    <td>{CHANNEL_LABELS[o.channel]??o.channel}{o.origin==='admin_manual'?<small>Pedido interno</small>:null}</td>
    <td>{o.order_items?.reduce((a,i)=>a+i.quantity,0)??0} un.</td>
    <td><strong>{formatBRL(o.total_cents)}</strong></td>
    <td><span className={'ops-tag status-'+o.status}>{ORDER_LABELS[o.status]??o.status}</span></td>
    <td><div className="ops-buttons"><button className="ops-small" onClick={()=>setExpanded(s=>s===o.id?null:o.id)}><History size={14}/> {expanded===o.id?'Ocultar':'Detalhes'}</button>
    {(actions[o.status]??[]).filter(()=>o.origin==='admin_manual').map(a=>
      <button key={a.status} className="ops-small primary" onClick={()=>startAction(o,a.status)}>{a.label}</button>)}</div>
    {expanded===o.id?<div className="ops-order-detail"><strong>Itens</strong>
     {o.order_items?.map(i=><p key={i.id}>{i.title_snapshot} • {i.sku_snapshot} • {i.quantity} × {formatBRL(i.unit_price_cents)}</p>)}
     {o.tracking_code?<p>Rastreio: {o.carrier} — {o.tracking_code}</p>:null}
     <strong>Histórico</strong>
     {[...(o.order_events??[])].sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(x=>
       <p key={x.id}>{dateTimeBR(x.created_at)} · {x.event_type}{x.note?' — '+x.note:''}</p>)}
    </div>:null}</td></tr>)}</tbody></table>
   {shown.length===0?<div className="admin-empty"><ShoppingBag size={32}/><h3>Sem pedidos</h3><p>Crie um pedido interno ou altere os filtros.</p></div>:null}
  </div>
  {open?<div className="admin-modal-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setOpen(false)}}>
   <section className="admin-modal" role="dialog" aria-modal="true" aria-label="Novo pedido interno">
    <div className="admin-modal-header"><div><div className="section-kicker">OPERAÇÃO INTERNA</div><h2>Novo pedido manual</h2></div><button aria-label="Fechar" disabled={saving} onClick={()=>setOpen(false)}><X/></button></div>
    <form className="admin-form" onSubmit={submitOrder}>
     <p className="ops-info">Este processo não cobra o cliente. O estoque será apenas reservado, sem descontar o saldo físico até o envio.</p>
     <div className="admin-form-grid"><label className="full">Cliente (opcional)
      <select value={buyer} onChange={e=>setBuyer(e.target.value)}><option value="">Balcão — sem cliente vinculado</option>
       {customers.map(c=><option key={c.id} value={c.id}>{c.display_name||'Sem nome'} ({c.role})</option>)}</select></label></div>
     <div className="ops-order-lines"><h3>Itens do pedido</h3>
      {lines.map((line,i)=><div key={line.key} className="ops-order-line"><label>SKU {i+1}<select required value={line.variant_id} onChange={e=>lineEdit(line.key,{variant_id:e.target.value})}><option value="">Selecionar item...</option>
       {sellable.map(v=><option key={v.id} value={v.id}>{v.products?.name} · {v.sku} · {formatBRL(v.products?.price_cents??0)} · saldo {(v.inventory?.on_hand??0)-(v.inventory?.reserved??0)}</option>)}</select></label>
       <label>Qtd.<input required type="number" value={line.quantity} onChange={e=>lineEdit(line.key,{quantity:e.target.value})} min={1} max={99}/></label>
       <button type="button" title="Remover item" disabled={lines.length===1} onClick={()=>lineDelete(line.key)}><Trash2 size={17}/></button></div>)}
      <button type="button" className="admin-outline" onClick={addLine} disabled={lines.length>=30}><Plus size={16}/> Adicionar SKU</button>
     </div>
     <div className="ops-order-total"><span>Valor calculado com os preços cadastrados</span><strong>{formatBRL(estimated)}</strong></div>
     {error?<p className="form-error" role="alert">{error}</p>:null}
     <div className="admin-form-footer"><button className="admin-outline" type="button" onClick={()=>setOpen(false)} disabled={saving}>Cancelar</button><button className="admin-primary" disabled={saving} type="submit">{saving?'Gravando...':'Criar pedido e reservar estoque'}</button></div>
    </form>
   </section></div>:null}
  {action?<div className="admin-modal-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setAction(null)}}>
   <section className="admin-modal smaller" role="dialog" aria-modal="true" aria-label="Atualizar pedido">
    <div className="admin-modal-header"><div><div className="section-kicker">PEDIDO #{action.order.id.slice(0,8).toUpperCase()}</div><h2>{ORDER_LABELS[action.next]}</h2></div><button aria-label="Fechar" disabled={saving} onClick={()=>setAction(null)}><X/></button></div>
    <form className="admin-form" onSubmit={advance}>
     {action.next==='paid'?<p className="ops-info">Somente confirme depois de conferir que o pagamento realmente entrou. O sistema NÃO consulta PIX, banco ou cartão.</p>:null}
     {action.next==='cancelled'?<p className="ops-info">O pedido será cancelado e todas as unidades reservadas serão liberadas. Não há estorno automático.</p>:null}
     {action.next==='shipped'?<p className="ops-info">O sistema fará a baixa física por lote disponível, não vencido, registrando cada movimento. Operação irreversível nesta versão.</p>:null}
     <div className="admin-form-grid">
      {action.next==='shipped'?<><label>Transportadora *<input required maxLength={90} value={carrier} onChange={e=>setCarrier(e.target.value)} placeholder="Correios, entrega própria..."/></label>
       <label>Código de rastreamento *<input required maxLength={120} value={tracking} onChange={e=>setTracking(e.target.value)}/></label></>:null}
      <label className="full">{action.next==='paid'?'Referência do recebimento / comprovante *':'Observação (opcional)'}
       <textarea rows={3} required={action.next==='paid'} minLength={action.next==='paid'?5:undefined} maxLength={500} value={note} onChange={e=>setNote(e.target.value)} placeholder={action.next==='paid'?'Ex.: PIX recebido em ...; referência ...':'Anotações administrativas'}/></label>
     </div>
     {error?<p className="form-error" role="alert">{error}</p>:null}
     <div className="admin-form-footer"><button type="button" className="admin-outline" onClick={()=>setAction(null)} disabled={saving}>Voltar</button>
      <button type="submit" disabled={saving} className="admin-primary">{saving?'Processando...':'Confirmar '+ORDER_LABELS[action.next]}</button></div>
    </form>
   </section></div>:null}
 </div>;
}
