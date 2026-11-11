'use client';
import {useMemo,useState} from 'react';
import {Search,Users} from 'lucide-react';
import {formatBRL} from '@/lib/products';
import {dateTimeBR} from '@/types/operations';
type Row={id:string;display_name:string;role:string;created_at:string;orders:number;total:number};
export function CustomerTable({customers}:{customers:Row[]}){
 const [query,setQuery]=useState(''),[role,setRole]=useState('todos');
 const shown=useMemo(()=>customers.filter(c=>
 (role==='todos'||c.role===role) && (!query||c.display_name.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))),
 [customers,query,role]);
 return <div>
  <div className="admin-filterbar"><label className="admin-search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar pelo nome"/></label>
   <select value={role} onChange={e=>setRole(e.target.value)}><option value="todos">Todos</option><option value="customer">Clientes</option><option value="staff">Equipe</option><option value="admin">Administradores</option></select></div>
  <div className="ops-table-scroll"><table className="ops-table"><thead><tr><th>Nome</th><th>Perfil</th><th>Cadastro</th><th>Pedidos</th><th>Valor total dos pedidos*</th></tr></thead>
   <tbody>{shown.map(c=><tr key={c.id}><td><strong>{c.display_name||'Sem nome informado'}</strong></td>
    <td><span className="ops-tag">{c.role==='admin'?'Administrador':c.role==='staff'?'Equipe':'Cliente'}</span></td>
    <td>{dateTimeBR(c.created_at)}</td><td>{c.orders}</td><td>{formatBRL(c.total)}</td></tr>)}</tbody></table>
   {shown.length===0?<div className="admin-empty"><Users size={33}/><h3>Sem cadastros para este filtro</h3></div>:null}</div>
  <p className="admin-help">*Somatório de pedidos não cancelados; não representa receita recebida.</p>
 </div>;
}
