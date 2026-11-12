import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ArrowLeft,Package,ClipboardCheck,AlertTriangle,FileDown} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {checkShipmentPreparation,type PreparedVolume,type ShippingDestination} from '@/lib/shipping/shipment-preparation';
import {VolumeEditor} from './volume-editor';
import {DeliveryAddressEditor} from './delivery-address-editor';
import {ShipmentProviderEditor} from './provider-editor';
import type {ProviderDraft} from '@/lib/shipping/provider-adapters';

export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default async function VolumesPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!uuid.test(id))notFound();
 const sb=await requireAdmin();
 const [order,prep,volumes,shippingOrigin,providerDraft,labelIntent,quoteHistory]=await Promise.all([
  sb.from('orders').select('id,origin,status,created_at,shipping_address_snapshot')
   .eq('id',id).eq('origin','admin_manual').maybeSingle(),
  sb.from('internal_package_preparations')
   .select('volumes,packing_notes').eq('order_id',id).maybeSingle(),
  sb.from('internal_package_volumes')
   .select('volume_number,weight_g,height_cm,width_cm,length_cm,contents_note')
   .eq('order_id',id).order('volume_number'),
  sb.from('shipping_origin_settings')
   .select('origin_postal_code').eq('id',1).maybeSingle(),
  sb.from('shipment_provider_drafts')
   .select('order_id,provider,service_code,operator_notes,revision,draft_token')
   .eq('order_id',id).maybeSingle(),
  sb.from('internal_label_intents')
   .select('intent_key,provider,service_code,draft_revision,updated_at')
   .eq('order_id',id).maybeSingle(),
  sb.from('shipment_sandbox_quote_snapshots')
   .select('id,intent_key,service_id,service_name,carrier_name,price_cents,delivery_days,quoted_at,reference_expires_at')
   .eq('order_id',id).order('quoted_at',{ascending:false}).limit(12)
 ]);
 if(order.error||!order.data)notFound();
 if(prep.error||volumes.error||shippingOrigin.error||providerDraft.error||labelIntent.error||quoteHistory.error)
  throw new Error('Não foi possível consultar a preparação dos volumes.');
 const rows:PreparedVolume[]=(volumes.data??[]).map(v=>({
  ...v,height_cm:Number(v.height_cm),width_cm:Number(v.width_cm),
  length_cm:Number(v.length_cm)
 }));
 const review=checkShipmentPreparation({
  origin:order.data.origin,status:order.data.status,
  originPostalCode:shippingOrigin.data?.origin_postal_code??null,
  destination:order.data.shipping_address_snapshot as ShippingDestination|null,
  plannedVolumes:prep.data?.volumes??null,volumes:rows
 });
 const editable=['paid','packing'].includes(order.data.status);
 return <div className="container admin-workspace pope-fiscal-area">
  <div className="admin-top"><div><div className="section-kicker">EXPEDIÇÃO • POPÊ BEAUTY</div>
   <h1><Package size={27}/> Medidas e conferência da remessa</h1>
   <p>Pedido #{id.slice(0,8).toUpperCase()} · Status: {order.data.status}</p>
  </div><Link className="admin-outline" href="/admin/logistica"><ArrowLeft size={16}/> Logística</Link></div>
  <p className="ops-info">Cadastro administrativo para futura integração logística.
   Não realiza cotação, compra, impressão de etiqueta postal ou despacho.</p>

  <section className="ops-form-card">
   <h2><ClipboardCheck size={19}/> Conferência pré-envio</h2>
   <div className="admin-metric-row">
    <div><Package/><small>Volumes registrados</small>
     <strong>{review.registered_volumes}/{review.expected_volumes||'—'}</strong></div>
    <div><ClipboardCheck/><small>Peso bruto cadastrado</small>
     <strong>{(review.total_weight_g/1000).toLocaleString('pt-BR',{maximumFractionDigits:3})} kg</strong></div>
    <div><AlertTriangle/><small>Pendências</small><strong>{review.issues.length}</strong></div>
   </div>
   {review.complete_for_manual_review?<div>
    <p className="form-success" role="status">
     Dados estruturais completos para revisão manual de uma futura integração logística.
    </p>
    <a className="admin-primary" href={'/api/admin/shipping/preparation/'+id}>
     <FileDown size={17}/> Exportar preparação da remessa (JSON)
    </a>
    <p className="admin-help">O JSON contém dados pessoais do destinatário. Armazene com proteção adequada.
     Ainda será necessária conferência fiscal e aprovação da transportadora; não é etiqueta oficial.</p>
   </div>:<div>
    <p className="form-error" role="status">
     Exportação de preparação bloqueada: corrija as pendências abaixo.</p>
    <ul>{review.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>
    <p className="admin-help">CEP de origem em <Link href="/admin/frete">Frete</Link>;
     destinatário e quantidade prevista na preparação do pedido.</p>
   </div>}
  </section>

  <ShipmentProviderEditor orderId={id} editable={editable}
   structurallyReady={review.complete_for_manual_review}
   draft={providerDraft.data as ProviderDraft|null}
   intent={labelIntent.data??null}
   history={quoteHistory.data??[]}
   sandboxAvailable={Boolean(process.env.MELHOR_ENVIO_SANDBOX_TOKEN?.trim())}/>

  <DeliveryAddressEditor orderId={id} editable={editable}
   initial={order.data.shipping_address_snapshot as ShippingDestination|null}/>

  {!prep.data?<p className="form-error">Defina primeiro a quantidade de volumes em
   <Link href="/admin/fiscal"> Fiscal e etiquetas</Link>, na seção de preparação de embalagem.</p>:
   <VolumeEditor orderId={id} count={prep.data.volumes}
    editable={editable} records={rows}/>}
 </div>;
}
