import Link from 'next/link';
import {Mail,MailCheck,Send,Clock,AlertTriangle,ShoppingBag} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {smtpConfigured} from '@/lib/order-notification-mail';
import {NotificationManager} from './notification-manager';
import type {NotificationRow} from '@/types/notifications';
export const dynamic='force-dynamic';
export default async function AdminNotificationsPage(){
 const sb=await requireAdmin();
 const {data,error}=await sb.from('order_notifications')
  .select('id,order_id,recipient_email,recipient_name,event_type,status,attempts,created_at,sent_at,last_attempt_at,error_message')
  .order('created_at',{ascending:false}).limit(300);
 if(error)return <div className="container admin-workspace">
  <h1>Notificações de pedidos</h1><p role="alert" className="form-error">{error.message}</p>
  <Link href="/admin/pedidos">Voltar a pedidos</Link>
 </div>;
 const rows=(data??[]) as NotificationRow[];
 return <div className="container admin-workspace">
  <div className="admin-top"><div><div className="section-kicker">COMUNICAÇÃO • POPÊ BEAUTY</div>
   <h1>Notificações de pedidos 💌</h1><p>Fila e histórico de mensagens enviadas aos clientes.</p></div>
   <Link href="/admin/pedidos" className="admin-outline"><ShoppingBag size={16}/> Pedidos</Link></div>
  <div className="admin-metric-row"><div><Mail/><small>Total de mensagens</small><strong>{rows.length}</strong></div>
   <div><Clock/><small>Pendentes</small><strong>{rows.filter(x=>x.status==='pending').length}</strong></div>
   <div><MailCheck/><small>Enviadas</small><strong>{rows.filter(x=>x.status==='sent').length}</strong></div>
   <div><AlertTriangle/><small>Com falha</small><strong>{rows.filter(x=>x.status==='failed').length}</strong></div></div>
  <div className="ops-info">
   <Send size={18}/><span>Envio transacional por SMTP: <strong>{smtpConfigured()?'credenciais presentes na Vercel':'credenciais pendentes na Vercel'}</strong>.
   {smtpConfigured()?' O recebimento precisa ser validado com um e-mail real.':' Configure SMTP_PASSWORD e os demais campos de SMTP para iniciar os envios.'}
   A criação de pedidos sem cliente associado não gera e-mail.</span>
  </div>
  <NotificationManager rows={rows} smtpReady={smtpConfigured()}/>
 </div>;
}
