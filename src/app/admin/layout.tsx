import type {ReactNode} from 'react';
import {requireAdmin} from '@/lib/admin';
import {AdminShell} from '@/components/admin-shell';

export const dynamic='force-dynamic';
export default async function AdminLayout({children}:{children:ReactNode}){
 const supabase=await requireAdmin();
 const {data:claims}=await supabase.auth.getClaims();
 const id=claims?.claims?.sub??'';
 const email=typeof claims?.claims?.email==='string'?claims.claims.email:'';
 // Registra a atividade do administrador antes de calcular o indicador.
 await supabase.rpc('touch_user_session_presence');
 const cutoff=new Date(Date.now()-3*60*1000).toISOString();
 const [profile,activity,orders,notifications]=await Promise.all([
  supabase.from('profiles').select('display_name,role').eq('id',id).maybeSingle(),
  supabase.from('user_session_presence').select('user_id')
   .is('signed_out_at',null).gte('last_seen_at',cutoff).limit(1000),
  supabase.from('orders').select('id',{count:'exact',head:true}).eq('status','pending'),
  supabase.from('order_notifications').select('id',{count:'exact',head:true}).in('status',['pending','failed'])
 ]);
 const name=profile.data?.display_name?.trim()||email.split('@')[0]||'Administrador';
 const onlineCount=new Set((activity.data??[]).map(x=>x.user_id)).size;
 return <AdminShell
  currentUser={{name,email,role:'admin'}}
  onlineCount={onlineCount}
  pendingOrders={orders.count??0}
  pendingNotifications={notifications.count??0}
 >{children}</AdminShell>;
}
