import Link from 'next/link';
import {Activity,Users,ShieldCheck,Clock,ArrowLeft} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {OnlineUsersTable} from './online-users-table';

export const dynamic='force-dynamic';
export type OnlineUser={
 user_id:string;email:string;name:string;role:string;
 last_seen_at:string;started_at:string;active_sessions:number;recent_sessions:number;
 signed_out:boolean;online:boolean;
};
export default async function OnlineUsersPage(){
 const supabase=await requireAdmin();
 const last24Hours=new Date(Date.now()-24*60*60*1000).toISOString();
 const cutoff=Date.now()-3*60*1000;
 const [sessions,profiles]=await Promise.all([
  supabase.from('user_session_presence')
   .select('session_id,user_id,user_email,started_at,last_seen_at,signed_out_at')
   .gte('last_seen_at',last24Hours).order('last_seen_at',{ascending:false}).limit(800),
  supabase.from('profiles').select('id,display_name,role').limit(2000)
 ]);
 if(sessions.error||profiles.error){
  return <div className="container admin-workspace"><h1>Usuários ativos</h1>
   <p role="alert" className="form-error">Não foi possível carregar a atividade: {sessions.error?.message??profiles.error?.message}</p></div>;
 }
 const names=new Map((profiles.data??[]).map(x=>[x.id,x]));
 const byUser=new Map<string,OnlineUser>();
 for(const session of sessions.data??[]){
  const recent=!session.signed_out_at&&new Date(session.last_seen_at).getTime()>=cutoff;
  const profile=names.get(session.user_id);
  const existing=byUser.get(session.user_id);
  if(!existing){
   byUser.set(session.user_id,{
    user_id:session.user_id,email:session.user_email||'',name:profile?.display_name?.trim()||session.user_email?.split('@')[0]||'Sem nome',
    role:profile?.role||'customer',last_seen_at:session.last_seen_at,started_at:session.started_at,
    online:recent,active_sessions:recent?1:0,recent_sessions:1,signed_out:!!session.signed_out_at
   });
  }else{
   existing.recent_sessions+=1;
   if(recent){existing.active_sessions+=1;existing.online=true;}
  }
 }
 const rows=Array.from(byUser.values()).sort((a,b)=>Number(b.online)-Number(a.online)||
  b.last_seen_at.localeCompare(a.last_seen_at));
 const onlineCount=rows.filter(x=>x.online).length;
 return <div className="container admin-workspace">
  <div className="admin-top"><div><div className="section-kicker">SEGURANÇA • PRESENÇA</div>
   <h1><Activity size={29}/> Usuários ativos</h1>
   <p>Visualização aproximada de sessões com atividade recente na Popê Beauty.</p></div>
   <Link href="/admin" className="admin-outline"><ArrowLeft size={16}/> Dashboard</Link></div>
  <div className="admin-metric-row">
   <div><Activity/><small>Ativos recentemente</small><strong>{onlineCount}</strong></div>
   <div><Users/><small>Usuários vistos em 24h</small><strong>{rows.length}</strong></div>
   <div><ShieldCheck/><small>Administradores ativos</small><strong>{rows.filter(x=>x.online&&x.role==='admin').length}</strong></div>
   <div><Clock/><small>Sessões ativas estimadas</small><strong>{rows.reduce((sum,x)=>sum+x.active_sessions,0)}</strong></div>
  </div>
  <p className="ops-info"><Activity size={18}/> “Ativo recentemente” significa que o navegador registrou atividade nos últimos 3 minutos. O status não certifica se uma sessão ainda está autenticada no servidor. Fechar o navegador sem sair é detectado após o prazo de inatividade; o monitoramento começou com esta atualização. Apenas administradores conseguem visualizar esta lista.</p>
  <OnlineUsersTable rows={rows}/>
 </div>;
}
