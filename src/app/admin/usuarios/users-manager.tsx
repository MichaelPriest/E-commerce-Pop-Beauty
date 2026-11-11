'use client';
import {useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import {Search,ShieldCheck,ShieldAlert,UserCog,UserRound,Clock,CheckCircle2,X} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {dateTimeBR} from '@/types/operations';
import type {AdminUser} from './page';
type Role=AdminUser['app_role'];
const labels:Record<Role,string>={admin:'Administrador',staff:'Equipe',customer:'Cliente'};
const descriptions:Record<Role,string>={
 admin:'Acesso completo ao painel e aos dados administrativos, incluindo área reservada +18 para prévia interna.',
 staff:'Perfil de equipe registrado; acesso aos módulos administrativos ainda não foi liberado nesta versão.',
 customer:'Conta de cliente sem permissões administrativas.'
};
export function UsersManager({rows,currentUserId}:{rows:AdminUser[];currentUserId:string}){
 const router=useRouter();
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('todos');
 const [selected,setSelected]=useState<AdminUser|null>(null),[target,setTarget]=useState<Role>('customer');
 const [confirmed,setConfirmed]=useState(false),[saving,setSaving]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const shown=useMemo(()=>rows.filter(u=>(filter==='todos'||u.app_role===filter)&&
  (!query||[u.display_name,u.email,u.app_role].join(' ').toLocaleLowerCase('pt-BR')
   .includes(query.toLocaleLowerCase('pt-BR')))),[rows,query,filter]);
 function open(u:AdminUser){
  if(u.user_id===currentUserId)return;
  setSelected(u);setTarget(u.app_role);setConfirmed(false);setError('');setNotice('');
 }
 async function save(){
  if(!selected||selected.user_id===currentUserId||target===selected.app_role||!confirmed||saving)return;
  setSaving(true);setError('');
  try{
   const {data,error:rpcError}=await createClient().rpc('change_user_role',{
    p_user_id:selected.user_id,p_role:target
   });
   if(rpcError)throw rpcError;
   setSelected(null);
   setNotice(data?'Permissão atualizada e registrada na auditoria.':'A conta já possuía essa permissão.');
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível alterar a permissão.');}
  finally{setSaving(false);}
 }
 return <>
  <div className="admin-filterbar">
   <label className="admin-search"><Search size={17}/>
    <input value={query} onChange={e=>setQuery(e.target.value)}
      placeholder="Buscar por nome, e-mail ou perfil"/></label>
   <select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filtrar por perfil">
    <option value="todos">Todos os perfis</option><option value="admin">Administradores</option>
    <option value="staff">Equipe</option><option value="customer">Clientes</option></select>
   <span className="pope-admin-filter-count">{shown.length} resultado(s)</span>
  </div>
  {notice?<p className="form-success" role="status">{notice}</p>:null}
  <div className="ops-table-scroll"><table className="ops-table">
   <thead><tr><th>Usuário</th><th>Perfil</th><th>Confirmação</th><th>Último acesso</th><th>Cadastro</th><th>Ações</th></tr></thead>
   <tbody>{shown.map(u=><tr key={u.user_id}>
    <td><div className="pope-online-user-cell"><span className="pope-online-avatar"><UserRound size={18}/></span>
     <div><strong>{u.display_name||'Sem nome informado'}</strong><small>{u.email}</small></div></div></td>
    <td><span className={'ops-tag'+(u.app_role==='admin'?' status-paid':'')}>
     {labels[u.app_role]}</span>{u.user_id===currentUserId?<small>Sua conta</small>:null}</td>
    <td><span className={'pope-admin-confirm-state'+(u.email_confirmed?' confirmed':'')}>
     {u.email_confirmed?'Confirmado':'Aguardando confirmação'}</span></td>
    <td>{u.last_signed_in_at?dateTimeBR(u.last_signed_in_at):'Nenhum login registrado'}</td>
    <td>{dateTimeBR(u.registered_at)}</td>
    <td>{u.user_id===currentUserId?
      <span className="ops-muted">Sua permissão é protegida</span>:
      <button type="button" className="ops-small primary" onClick={()=>open(u)}><UserCog size={16}/> Alterar perfil</button>}</td>
   </tr>)}</tbody>
  </table>
  {shown.length===0?<div className="admin-empty"><Search size={33}/><h3>Nenhum usuário encontrado</h3></div>:null}
  </div>
  <p className="admin-help">Alterações são aplicadas ao papel no banco e passam a valer nas próximas verificações de autorização. A lista não permite criar contas sem autorização dos próprios titulares nem redefine senhas.</p>
  {selected?<div className="admin-modal-overlay" role="presentation"
    onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setSelected(null);}}>
   <section className="admin-modal smaller" role="dialog" aria-modal="true" aria-label="Alterar perfil de acesso">
    <div className="admin-modal-header">
     <div><div className="section-kicker">SEGURANÇA DA LOJA</div><h2>Alterar nível de acesso</h2></div>
     <button type="button" aria-label="Fechar" onClick={()=>setSelected(null)} disabled={saving}><X/></button>
    </div>
    <div className="admin-form">
     <div className="pope-admin-user-summary"><strong>{selected.display_name||'Usuário'}</strong>
      <small>{selected.email}</small><span>Permissão atual: {labels[selected.app_role]}</span></div>
     <div className="admin-form-grid"><label className="full">Nova permissão
      <select value={target} onChange={e=>{setTarget(e.target.value as Role);setConfirmed(false);}}>
       <option value="customer">Cliente</option><option value="staff">Equipe</option>
       <option value="admin" disabled={!selected.email_confirmed}>Administrador</option>
      </select></label></div>
     <p className="pope-admin-role-description">{descriptions[target]}</p>
     {target==='admin'?<p className="ops-info"><ShieldAlert size={18}/> A promoção concede acesso aos dados da loja e à prévia interna +18. Só promova pessoas autorizadas e com e-mail confirmado; isso não comprova maioridade como cliente.</p>:null}
     {target!==selected.app_role?<label className="settings-check">
      <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
      <span>Confirmo que autorizei essa alteração de permissão para a conta indicada.</span>
     </label>:null}
     {error?<p className="form-error" role="alert">{error}</p>:null}
     <div className="admin-form-footer">
      <button type="button" className="admin-outline" onClick={()=>setSelected(null)} disabled={saving}>Cancelar</button>
      <button type="button" className="admin-primary" onClick={save}
       disabled={saving||!confirmed||target===selected.app_role}>
       <CheckCircle2 size={17}/>{saving?'Salvando...':'Confirmar alteração'}</button>
     </div>
    </div>
   </section>
  </div>:null}
 </>;
}
