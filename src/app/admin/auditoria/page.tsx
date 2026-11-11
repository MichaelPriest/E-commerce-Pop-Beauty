import Link from 'next/link';
import {History,ShieldCheck,UserCog,LockKeyhole,ArrowLeft} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {AuditTable} from './audit-table';
export const dynamic='force-dynamic';
export type AuditItem={
 id:string;actor_id:string|null;target_user_id:string|null;
 action:string;before_value:string|null;after_value:string|null;created_at:string;
 actor_name:string;target_name:string;
};
export default async function AuditPage(){
 const sb=await requireAdmin();
 const [events,profiles]=await Promise.all([
  sb.from('admin_audit_events')
   .select('id,actor_id,target_user_id,action,before_value,after_value,created_at')
   .order('created_at',{ascending:false}).limit(500),
  sb.from('profiles').select('id,display_name').limit(1000)
 ]);
 if(events.error||profiles.error)return <div className="container admin-workspace">
  <h1>Auditoria</h1><p role="alert" className="form-error">{events.error?.message||profiles.error?.message}</p></div>;
 const names=new Map((profiles.data??[]).map(p=>[p.id,p.display_name]));
 const records=(events.data??[]).map(event=>({
  ...event,
  actor_name:event.actor_id?names.get(event.actor_id)||'Conta indisponível':'Alteração técnica / SQL',
  target_name:event.target_user_id?names.get(event.target_user_id)||'Conta indisponível':'Configuração da loja'
 }));
 return <div className="container admin-workspace">
  <div className="admin-top"><div><div className="section-kicker">RASTREABILIDADE • POPÊ BEAUTY</div>
   <h1><History size={29}/> Auditoria administrativa</h1>
   <p>Histórico de mudanças de permissões e configurações sensíveis.</p></div>
   <Link href="/admin/usuarios" className="admin-outline"><ArrowLeft size={17}/> Usuários</Link>
  </div>
  <div className="admin-metric-row">
   <div><History/><small>Eventos consultados</small><strong>{records.length}</strong></div>
   <div><UserCog/><small>Alterações de permissões</small><strong>{records.filter(x=>x.action==='user_role_changed').length}</strong></div>
   <div><LockKeyhole/><small>Alterações na seção +18</small><strong>{records.filter(x=>x.action==='adult_section_toggled').length}</strong></div>
   <div><ShieldCheck/><small>Exclusivo administrador</small><strong>Ativo</strong></div>
  </div>
  <p className="ops-info"><ShieldCheck size={18}/> Este histórico começa com a implantação do módulo. Alterações de pedidos e movimentações de estoque possuem registros próprios; aqui são apresentados apenas mudanças de perfil e ativação/desativação da seção adulta. Não é possível apagar registros pela interface.</p>
  <AuditTable rows={records as AuditItem[]}/>
 </div>;
}
