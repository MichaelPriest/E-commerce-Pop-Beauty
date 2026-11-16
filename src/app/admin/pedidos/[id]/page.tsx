import Link from 'next/link';
import {notFound} from 'next/navigation';
import {
 ArrowLeft,ArrowUpRight,ClipboardList,CreditCard,FileText,
 History,Mail,Package,ShieldAlert,ShoppingBag,Truck,UserRound,CheckCircle2
} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {formatBRL} from '@/lib/products';
import {ORDER_LABELS,CHANNEL_LABELS,dateTimeBR} from '@/types/operations';
import {
 summarizeOrderCenter,nextOrderCenterStep,ORDER_CENTER_TONE_LABEL,
 type OrderCenterStepId,type OrderCenterTone
} from '@/lib/orders/order-command-center';
import './order-center.css';

export const dynamic='force-dynamic';
export const metadata={title:'Acompanhamento do pedido | Popê Beauty'};
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const icons={order:ShoppingBag,payment:CreditCard,fiscal:FileText,
 packing:Package,shipping:Truck,notifications:Mail};
const destinations:Record<OrderCenterStepId,string>={
 order:'/admin/pedidos',
 payment:'/admin/pedidos',
 fiscal:'/admin/fiscal',
 packing:'/admin/logistica',
 shipping:'/admin/remessas',
 notifications:'/admin/notificacoes'
};
const scalar=(x:unknown)=>typeof x==='string'?x.trim():'';
function deliveryAddress(value:unknown):string[]{
 if(!value||typeof value!=='object'||Array.isArray(value))return [];
 const v=value as Record<string,unknown>;
 const a=[scalar(v.street),scalar(v.house_number)].filter(Boolean).join(', ');
 const d=[scalar(v.district),scalar(v.city),scalar(v.state_code)]
  .filter(Boolean).join(' · ');
 const cep=scalar(v.postal_code);
 return [scalar(v.recipient),a,scalar(v.complement),d,cep?'CEP '+cep:'']
  .filter(Boolean);
}
export default async function AdminOrderDetails({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!uuid.test(id))notFound();
 const sb=await requireAdmin();
 const [order,items,events,notices,draft,recipient,integration,packing,
  volumes,requests,documents,tracking,attempts,plan,preflight]=await Promise.all([
  sb.from('orders').select('id,customer_id,origin,channel,status,total_cents,created_at,updated_at,payment_reference,carrier,tracking_code,shipped_at,delivered_at,shipping_address_snapshot')
   .eq('id',id).maybeSingle(),
  sb.from('order_items').select('id,sku_snapshot,title_snapshot,quantity,unit_price_cents')
   .eq('order_id',id).order('sku_snapshot'),
  sb.from('order_events').select('id,event_type,note,created_at')
   .eq('order_id',id).order('created_at',{ascending:false}).limit(100),
  sb.from('order_notifications').select('id,event_type,status,created_at,sent_at')
   .eq('order_id',id).order('created_at',{ascending:false}).limit(50),
  sb.from('fiscal_order_drafts').select('fiscal_model,operation_nature,status,updated_at')
   .eq('order_id',id).maybeSingle(),
  sb.from('fiscal_order_recipients').select('full_name')
   .eq('order_id',id).maybeSingle(),
  sb.from('fiscal_document_integration').select('environment,status,created_at')
   .eq('order_id',id).maybeSingle(),
  sb.from('internal_package_preparations').select('volumes,updated_at')
   .eq('order_id',id).maybeSingle(),
  sb.from('internal_package_volumes').select('volume_number,weight_g,height_cm,width_cm,length_cm')
   .eq('order_id',id).order('volume_number').limit(100),
  sb.from('shipment_workflow_requests').select('id,status,provider,created_at')
   .eq('order_id',id).order('created_at',{ascending:false}).limit(20),
  sb.from('shipment_provider_documents').select('id,document_type,verified_at')
   .eq('order_id',id).order('verified_at',{ascending:false}).limit(20),
  sb.from('shipment_tracking_provider_events').select('id,provider,carrier_status,occurred_at')
   .eq('order_id',id).order('occurred_at',{ascending:false}).limit(30),
  sb.from('sandbox_payment_attempts').select('id,provider,environment,state,created_at')
   .eq('order_id',id).order('created_at',{ascending:false}).limit(30),
  sb.from('shipment_provider_operation_plans').select('id,state,external_dispatch_count,updated_at')
   .eq('order_id',id).maybeSingle(),
  sb.from('shipment_purchase_preflights').select('request_id,checklist_complete_internal,reviewed_at')
   .eq('order_id',id).order('reviewed_at',{ascending:false}).limit(5)
 ]);
 if(order.error)throw new Error('Não foi possível consultar o pedido.');
 if(!order.data)notFound();
 const failed=[items,events,notices,draft,recipient,integration,packing,
  volumes,requests,documents,tracking,attempts,plan,preflight]
  .find(result=>result.error);
 if(failed?.error)throw new Error('Falha ao consultar o acompanhamento do pedido: '+failed.error.message);

 const o=order.data;
 const customer=o.customer_id?await sb.from('profiles').select('display_name')
  .eq('id',o.customer_id).maybeSingle():null;
 if(customer?.error)throw new Error('Não foi possível consultar o vínculo do cliente.');
 const attemptsList=attempts.data??[];
 const attemptIds=attemptsList.map(a=>a.id);
 const webhooks=attemptIds.length?await sb.from('payment_webhook_receipts')
  .select('id,matched_attempt_id,relation_status,signature_validated,provider_payment_status')
  .in('matched_attempt_id',attemptIds).order('received_at',{ascending:false}).limit(50):null;
 if(webhooks?.error)throw new Error('Não foi possível consultar a auditoria do pagamento sandbox.');

 const notificationList=notices.data??[];
 const sent=notificationList.filter(n=>n.status==='sent').length;
 const pending=notificationList.filter(n=>n.status==='pending').length;
 const failedNotices=notificationList.filter(n=>n.status==='failed').length;
 const steps=summarizeOrderCenter({
  origin:o.origin,status:o.status,itemCount:(items.data??[]).length,
  hasManualPaymentReference:Boolean(o.payment_reference),
  hasManualCarrierTracking:Boolean(o.tracking_code),
  sandboxPaymentAttempts:attemptsList.length,
  sandboxWebhookReceipts:webhooks?.data?.length??0,
  hasFiscalDraft:Boolean(draft.data),hasFiscalRecipient:Boolean(recipient.data),
  fiscalIntegrationStatus:integration.data?.status??null,
  plannedVolumes:packing.data?.volumes??null,registeredVolumes:(volumes.data??[]).length,
  internalRequests:(requests.data??[]).length,
  officialDocuments:(documents.data??[]).length,
  verifiedTrackingEvents:(tracking.data??[]).length,
  sentNotifications:sent,pendingNotifications:pending,failedNotifications:failedNotices
 });
 const next=nextOrderCenterStep(steps,o.status);
 const isManual=o.origin==='admin_manual';
 const fiscalHref=isManual?'/admin/fiscal?pedido='+id:'/admin/pagamentos';
 const actionLinks:Record<OrderCenterStepId,string>={
  ...destinations,
  order:'/admin/pedidos?pedido='+id,
  payment:isManual?'/admin/pedidos?pedido='+id:'/admin/pagamentos',
  fiscal:fiscalHref,
  packing:isManual?'/admin/logistica/volumes/'+id:'/admin/logistica',
  shipping:isManual?'/admin/logistica/volumes/'+id:'/admin/remessas',
  notifications:'/admin/notificacoes'
 };
 const stateClass=(s:OrderCenterTone)=>'pope-oc-state state-'+s;
 const name=customer?.data?.display_name??(o.customer_id?'Cliente cadastrado':'Balcão / não vinculado');
 const address=deliveryAddress(o.shipping_address_snapshot);
 const lineTotal=(items.data??[]).reduce((sum,item)=>sum+item.quantity*item.unit_price_cents,0);
 const badges=steps.filter(x=>x.state==='pending').length;
 return <div className="container admin-workspace pope-order-center">
  <div className="admin-top">
   <div>
    <div className="section-kicker">POPÊ BEAUTY • OPERAÇÃO DE PEDIDOS</div>
    <h1><ClipboardList size={27}/> Pedido #{o.id.slice(0,8).toUpperCase()}</h1>
    <p>Visão unificada da situação administrativa. Criado em {dateTimeBR(o.created_at)}.</p>
   </div>
   <Link className="admin-outline" href="/admin/pedidos">
    <ArrowLeft size={17}/> Voltar aos pedidos</Link>
  </div>
  <div className="pope-oc-overview">
   <div><small>Status do pedido</small>
    <strong>{ORDER_LABELS[o.status as keyof typeof ORDER_LABELS]??o.status}</strong>
    <span>{isManual?'Movimentação administrativa manual':'Origem loja / homologação'}</span>
   </div>
   <div><small>Valor registrado</small><strong>{formatBRL(o.total_cents)}</strong>
    <span>Não equivale a recebimento bancário</span></div>
   <div><small>Cliente</small><strong>{name}</strong>
    <span>{CHANNEL_LABELS[o.channel as keyof typeof CHANNEL_LABELS]??o.channel}</span></div>
   <div><small>Pendências de conferência</small><strong>{badges}</strong>
    <span>Indicadores internos, não autorizações oficiais</span></div>
  </div>
  <p className="ops-info"><ShieldAlert size={19}/>
   Esta página é uma <strong>consolidação somente leitura</strong>.
   Pedidos marcados como pagos, enviados ou entregues manualmente não representam
   confirmação do gateway, emissão fiscal ou rastreamento autenticado.
   Nada nesta tela cobra, estorna, gera etiqueta ou modifica o estoque.</p>
  {next?<section className="pope-oc-next" aria-label="Próxima pendência">
   <div><span className="section-kicker">PRÓXIMA CONFERÊNCIA SUGERIDA</span>
    <h2>{next.title}: {next.label}</h2><p>{next.description}</p></div>
   <Link className="admin-primary" href={actionLinks[next.id]}>
    Ir para o módulo <ArrowUpRight size={17}/></Link>
  </section>:<p className="admin-help">
   {o.status==='cancelled'?'Pedido cancelado. Consulte o histórico e as pendências documentais.':
    'Nenhuma pendência simples identificada automaticamente; ainda pode haver conferências externas necessárias.'}
  </p>}
  <nav className="pope-oc-nav" aria-label="Seções do pedido">
   {steps.map(x=><a href={'#etapa-'+x.id} key={x.id}>{x.title}</a>)}
   <a href="#itens">Itens</a><a href="#historico">Histórico</a>
  </nav>
  <div className="pope-oc-flow" aria-label="Etapas operacionais">
   {steps.map((stage,i)=>{
    const Icon=icons[stage.id];
    return <section className="pope-oc-step" id={'etapa-'+stage.id} key={stage.id}>
     <div className="pope-oc-step-icon"><Icon size={21}/><span>{i+1}</span></div>
     <div className="pope-oc-step-main">
      <div className="pope-oc-step-head"><h2>{stage.title}</h2>
       <span className={stateClass(stage.state)}>{ORDER_CENTER_TONE_LABEL[stage.state]}</span>
      </div>
      <h3>{stage.label}</h3>
      <p>{stage.description}</p>
      {stage.id==='payment'&&o.payment_reference?<p className="pope-oc-evidence">
       Referência informada: {o.payment_reference} (não verificada automaticamente)</p>:null}
      {stage.id==='fiscal'&&draft.data?<p className="pope-oc-evidence">
       Rascunho {draft.data.fiscal_model==='65'?'NFC-e 65':'NF-e 55'} ·
       Status interno: {draft.data.status} · Sem protocolo de autorização SEFAZ.</p>:null}
      {stage.id==='shipping'&&o.tracking_code?<p className="pope-oc-evidence">
       Código informado manualmente: {o.tracking_code} · {o.carrier??'Transportadora não informada'}.
       Não confirmado junto ao transportador.</p>:null}
      {stage.id==='shipping'&&(plan.data||preflight.data?.length)?<p className="pope-oc-evidence">
       Preparação técnica: {preflight.data?.[0]?.checklist_complete_internal?
        'checklist interno completo':'conferência pendente'}
       {plan.data?' · Plano de operação: '+plan.data.state:''}.
       Nenhum registro técnico autoriza compra.</p>:null}
      {stage.id==='shipping'&&(documents.data??[]).length>0?
       <p className="pope-oc-evidence">
        {(documents.data??[]).length} documento(s) do provedor armazenado(s).
        Confira na central de evidências.</p>:null}
      <div className="pope-oc-actions">
       <Link className="admin-outline" href={actionLinks[stage.id]}>
        {stage.id==='fiscal'?'Conferir preparação fiscal':
         stage.id==='packing'?'Abrir preparação de volumes':
         stage.id==='shipping'?'Abrir logística':
         stage.id==='notifications'?'Ver fila de comunicação':
         stage.id==='payment'?'Conferir pagamento':'Ver operações do pedido'}
        <ArrowUpRight size={16}/></Link>
       {stage.id==='fiscal'&&isManual?<Link className="admin-outline"
        href={'/admin/fiscal/documentos/'+id+'?tipo=conferencia'}>
        Visualizar rascunho não fiscal</Link>:null}
       {stage.id==='shipping'&&isManual?<Link className="admin-outline"
        href="/admin/remessas/evidencias">Ver evidências oficiais</Link>:null}
      </div>
     </div>
    </section>;
   })}
  </div>
  <div className="pope-oc-columns">
   <section className="admin-panel" id="itens">
    <h2><ShoppingBag size={20}/> Itens do pedido</h2>
    <div className="ops-table-scroll"><table className="ops-table">
     <thead><tr><th>Item</th><th>SKU</th><th>Quantidade</th><th>Total</th></tr></thead>
     <tbody>{(items.data??[]).map(item=><tr key={item.id}>
      <td>{item.title_snapshot}</td><td>{item.sku_snapshot}</td>
      <td>{item.quantity}</td>
      <td>{formatBRL(item.quantity*item.unit_price_cents)}</td>
     </tr>)}</tbody>
    </table></div>
    {!items.data?.length?<p className="admin-help">Itens ainda não localizados.</p>:null}
    <p className="admin-help">Soma dos itens: {formatBRL(lineTotal)} ·
     Total registrado: {formatBRL(o.total_cents)}.
     {lineTotal!==o.total_cents?' Diferença encontrada: verifique descontos e lançamentos.':''}</p>
   </section>
   <section className="admin-panel">
    <h2><UserRound size={20}/> Destinatário e comunicação</h2>
    <p><strong>{name}</strong></p>
    {address.length?<div className="pope-oc-address">
     {address.map((line,i)=><p key={i}>{line}</p>)}
    </div>:<p className="admin-help">Nenhum endereço de entrega salvo no pedido.</p>}
    <p className="admin-help">
     Notificações registradas: {sent} enviadas · {pending} pendentes ·
     {' '}{failedNotices} com falha.
     {notificationList.length===50?' Exibindo somente as últimas 50.':''}
    </p>
    <Link className="admin-outline" href="/admin/notificacoes">
     <Mail size={16}/> Abrir notificações</Link>
   </section>
  </div>
  <section className="admin-panel" id="historico">
   <h2><History size={21}/> Histórico auditável</h2>
   {(events.data??[]).length?<div className="pope-oc-timeline">
    {(events.data??[]).map(e=><div className="pope-oc-event" key={e.id}>
     <span><CheckCircle2 size={17}/>{dateTimeBR(e.created_at)}</span>
     <strong>{e.event_type}</strong>
     {e.note?<p>{e.note}</p>:null}
    </div>)}
   </div>:<p className="admin-help">Nenhum evento administrativo registrado.</p>}
   {(events.data??[]).length===100?<p className="admin-help">
    Exibindo os 100 eventos mais recentes, sem excluir o histórico anterior.</p>:null}
  </section>
  <div className="pope-oc-footer">
   <Link className="admin-outline" href={'/admin/pedidos?pedido='+id}>
    <ArrowLeft size={16}/> Ações administrativas do pedido</Link>
   {isManual?<Link className="admin-outline"
    href={'/admin/logistica/volumes/'+id}><Package size={16}/> Abrir volumes e expedição</Link>:null}
   <Link className="admin-outline" href="/admin/prontidao">
    <ClipboardList size={16}/> Prontidão para produção</Link>
  </div>
 </div>;
}
