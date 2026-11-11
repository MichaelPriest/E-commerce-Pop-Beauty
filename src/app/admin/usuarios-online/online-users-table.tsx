'use client';
import {useEffect,useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import {RefreshCw,Search,UserRound,Activity} from 'lucide-react';
import type {OnlineUser} from './page';
import {dateTimeBR} from '@/types/operations';

export function OnlineUsersTable({rows}:{rows:OnlineUser[]}){
 const router=useRouter();
 const [query,setQuery]=useState(''),[status,setStatus]=useState('todos');
 const [refreshing,setRefreshing]=useState(false);
 useEffect(()=>{
  const timer=window.setInterval(()=>router.refresh(),60000);
  return ()=>window.clearInterval(timer);
 },[router]);
 const shown=useMemo(()=>rows.filter(r=>
  (status==='todos'||(status==='online'?r.online:!r.online))&&
  (!query||[r.name,r.email,r.role].join(' ').toLowerCase().includes(query.toLowerCase()))
 ),[rows,query,status]);
 function refresh(){setRefreshing(true);router.refresh();window.setTimeout(()=>setRefreshing(false),900);}
 return <>
  <div className="admin-filterbar">
   <label className="admin-search"><Search size={18}/><input
    value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nome ou e-mail"/></label>
   <select value={status} onChange={e=>setStatus(e.target.value)} aria-label="Filtrar status">
    <option value="todos">Todos</option><option value="online">Ativos recentemente</option><option value="offline">Inativos</option>
   </select>
   <button type="button" onClick={refresh} className="admin-outline" disabled={refreshing}>
    <RefreshCw size={16}/>{refreshing?'Atualizando...':'Atualizar'}</button>
  </div>
  <div className="ops-table-scroll"><table className="ops-table">
   <thead><tr><th>Usuário</th><th>Papel</th><th>Atividade</th><th>Último sinal</th><th>Sessões recentes</th></tr></thead>
   <tbody>{shown.map(row=><tr key={row.user_id}>
    <td><div className="pope-online-user-cell">
     <span className="pope-online-avatar"><UserRound size={18}/></span>
     <div><strong>{row.name}</strong><small>{row.email||'E-mail não disponível'}</small></div>
    </div></td>
    <td><span className="ops-tag">{row.role==='admin'?'Administrador':row.role==='staff'?'Equipe':'Cliente'}</span></td>
    <td><span className={'pope-online-state'+(row.online?' is-online':'')}>
     <span className="pope-admin-online-dot"/>{row.online?'Ativo recentemente':row.signed_out?'Saiu da conta':'Inativo'}</span></td>
    <td>{dateTimeBR(row.last_seen_at)}</td>
    <td><strong>{row.active_sessions}</strong> ativas<small>{row.recent_sessions} vistas em 24h</small></td>
   </tr>)}</tbody></table>
   {!shown.length?<div className="admin-empty"><Activity size={36}/><h3>Nenhuma atividade encontrada</h3>
    <p>Os registros aparecerão quando usuários autenticados acessarem a loja ou a administração.</p></div>:null}
  </div>
  <p className="admin-help">Atualização automática a cada 60 segundos. Não são coletados IP, localização nem páginas visitadas.</p>
 </>;
}
