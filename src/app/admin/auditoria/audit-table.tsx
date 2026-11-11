'use client';
import {useMemo,useState} from 'react';
import {Search,History} from 'lucide-react';
import {dateTimeBR} from '@/types/operations';
import type {AuditItem} from './page';
const roleName=(role:string|null)=>role==='admin'?'Administrador':role==='staff'?'Equipe':role==='customer'?'Cliente':role??'—';
export function AuditTable({rows}:{rows:AuditItem[]}){
 const [query,setQuery]=useState(''),[type,setType]=useState('todos');
 const filtered=useMemo(()=>rows.filter(x=>(type==='todos'||x.action===type)&&
 (!query||[x.actor_name,x.target_name,x.action].join(' ').toLowerCase().includes(query.toLowerCase()))),[rows,query,type]);
 return <>
  <div className="admin-filterbar"><label className="admin-search"><Search size={18}/>
   <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar por responsável ou alvo"/></label>
   <select value={type} onChange={e=>setType(e.target.value)}>
    <option value="todos">Todos os eventos</option>
    <option value="user_role_changed">Permissões</option>
    <option value="adult_section_toggled">Seção +18</option>
   </select></div>
  <div className="ops-table-scroll"><table className="ops-table">
   <thead><tr><th>Data e hora</th><th>Ação</th><th>Responsável</th><th>Usuário / Recurso</th><th>Antes</th><th>Depois</th></tr></thead>
   <tbody>{filtered.map(event=>{
    const role=event.action==='user_role_changed';
    const value=(val:string|null)=>role?roleName(val):val==='true'?'Ativado':val==='false'?'Desativado':val??'—';
    return <tr key={event.id}>
     <td>{dateTimeBR(event.created_at)}</td>
     <td><span className="ops-tag">{role?'Perfil de acesso':'Seção +18'}</span></td>
     <td><strong>{event.actor_name}</strong></td>
     <td>{event.target_name}</td>
     <td>{value(event.before_value)}</td>
     <td><strong>{value(event.after_value)}</strong></td>
    </tr>;
   })}</tbody>
  </table>
  {!filtered.length?<div className="admin-empty"><History size={34}/><h3>Nenhum evento neste filtro</h3>
   <p>Alterações futuras de permissão e da seção +18 aparecerão aqui.</p></div>:null}
  </div>
 </>;
}
