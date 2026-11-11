import Link from 'next/link';
import {ShieldCheck,Users,UserCog,UserRoundCheck} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {UsersManager} from './users-manager';
export const dynamic='force-dynamic';

export type AdminUser={
 user_id:string;display_name:string;app_role:'admin'|'staff'|'customer';
 registered_at:string;email:string;email_confirmed:boolean;last_signed_in_at:string|null;
};

export default async function AdminUsersPage(){
 const sb=await requireAdmin();
 const [{data:claimData},{data:users,error}]=await Promise.all([
  sb.auth.getClaims(),sb.rpc('admin_users_directory')
 ]);
 if(error)return <div className="container admin-workspace"><h1>Usuários e permissões</h1>
  <p className="form-error" role="alert">Falha ao carregar usuários: {error.message}</p></div>;
 const rows=(users??[]) as AdminUser[];
 return <div className="container admin-workspace">
  <div className="admin-top"><div><div className="section-kicker">CONTROLE DE ACESSO • POPÊ BEAUTY</div>
   <h1><UserCog size={30}/> Usuários e permissões</h1>
   <p>Consulte usuários cadastrados e controle quem pode administrar a loja.</p></div>
   <Link href="/admin/auditoria" className="admin-outline"><ShieldCheck size={17}/> Histórico de alterações</Link>
  </div>
  <div className="admin-metric-row">
   <div><Users/><small>Contas cadastradas</small><strong>{rows.length}</strong></div>
   <div><ShieldCheck/><small>Administradores</small><strong>{rows.filter(u=>u.app_role==='admin').length}</strong></div>
   <div><UserRoundCheck/><small>Equipe</small><strong>{rows.filter(u=>u.app_role==='staff').length}</strong></div>
   <div><Users/><small>Clientes</small><strong>{rows.filter(u=>u.app_role==='customer').length}</strong></div>
  </div>
  <p className="ops-info"><ShieldCheck size={18}/> Apenas administradores podem alterar permissões. Contas com perfil “Equipe” ainda não têm acesso ao painel administrativo; os módulos de administração continuam exclusivos para “Administrador”. A atribuição de administrador dá acesso completo aos módulos internos, incluindo o catálogo reservado. O e-mail precisa estar confirmado antes de promover uma conta.</p>
  <UsersManager rows={rows} currentUserId={claimData?.claims?.sub??''}/>
 </div>;
}
