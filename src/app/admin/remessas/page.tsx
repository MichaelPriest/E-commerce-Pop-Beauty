import Link from 'next/link';
import {Package,Truck,ShieldCheck,ClipboardCheck,ArrowLeft} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {dateTimeBR} from '@/types/operations';
import {checkShipmentPreparation,type PreparedVolume,
 type ShippingDestination} from '@/lib/shipping/shipment-preparation';
import {PROVIDERS,isShippingProvider} from '@/lib/shipping/provider-adapters';
export const dynamic='force-dynamic';
export const metadata={title:'Remessas e transportadoras | Popê Beauty'};

export default async function ShipmentsPage(){
 const sb=await requireAdmin();
 const [orders,origin]=await Promise.all([
  sb.from('orders').select('id,origin,status,created_at,shipping_address_snapshot')
   .eq('origin','admin_manual').in('status',['paid','packing'])
   .order('created_at',{ascending:false}).limit(100),
  sb.from('shipping_origin_settings').select('origin_postal_code').eq('id',1).maybeSingle()
 ]);
 if(orders.error||origin.error)throw new Error('Não foi possível carregar a fila de remessas.');
 const list=orders.data??[];
 const ids=list.map(o=>o.id);
 const [preps,volumeRows,drafts]=ids.length?await Promise.all([
  sb.from('internal_package_preparations').select('order_id,volumes').in('order_id',ids),
  sb.from('internal_package_volumes')
   .select('order_id,volume_number,weight_g,height_cm,width_cm,length_cm,contents_note').in('order_id',ids),
  sb.from('shipment_provider_drafts')
   .select('order_id,provider,service_code,revision').in('order_id',ids)
 ]):[{data:[],error:null},{data:[],error:null},{data:[],error:null}];
 if(preps.error||volumeRows.error||drafts.error)
  throw new Error('Não foi possível conferir as informações das remessas.');
 const prepByOrder=new Map((preps.data??[]).map(x=>[x.order_id,x]));
 const draftByOrder=new Map((drafts.data??[]).map(x=>[x.order_id,x]));
 const rows=list.map(order=>{
  const volumes:PreparedVolume[]=(volumeRows.data??[])
   .filter(x=>x.order_id===order.id)
   .map(x=>({
    volume_number:x.volume_number,weight_g:x.weight_g,
    height_cm:Number(x.height_cm),width_cm:Number(x.width_cm),
    length_cm:Number(x.length_cm),contents_note:x.contents_note
   }));
  const check=checkShipmentPreparation({
   origin:order.origin,status:order.status,
   originPostalCode:origin.data?.origin_postal_code??null,
   destination:order.shipping_address_snapshot as ShippingDestination|null,
   plannedVolumes:prepByOrder.get(order.id)?.volumes??null,volumes
  });
  return {order,check,draft:draftByOrder.get(order.id)??null};
 });
 const ready=rows.filter(r=>r.check.complete_for_manual_review).length;
 const configured=rows.filter(r=>r.draft).length;
 return <div className="container admin-workspace">
  <div className="admin-top">
   <div><div className="section-kicker">POPÊ BEAUTY • EXPEDIÇÃO</div>
    <h1><Truck size={29}/> Central de remessas</h1>
    <p>Fila de preparação de pedidos internos, dados físicos e preferências de transportadoras.</p>
   </div><Link className="admin-outline" href="/admin/logistica"><ArrowLeft size={16}/> Logística</Link>
  </div>
  <div className="admin-metric-row">
   <div><Package/><small>Pedidos em preparação</small><strong>{rows.length}</strong></div>
   <div><ClipboardCheck/><small>Dados internos completos</small><strong>{ready}</strong></div>
   <div><Truck/><small>Integrador selecionado</small><strong>{configured}</strong></div>
   <div><ShieldCheck/><small>Etiquetas oficiais geradas</small><strong>0</strong></div>
  </div>
  <p className="ops-info"><ShieldCheck size={17}/> Somente conferência interna.
   A seleção de Correios ou Melhor Envio não aciona APIs, não compra frete, não cria PLP ou rastreio.</p>
  <div className="ops-table-scroll">
   <table className="ops-table">
    <thead><tr><th>Pedido</th><th>Etapa</th><th>Volumes</th><th>Dados</th>
     <th>Integração</th><th>Pendências</th><th>Operação</th></tr></thead>
    <tbody>{rows.map(({order,check,draft})=><tr key={order.id}>
     <td><strong>#{order.id.slice(0,8).toUpperCase()}</strong>
      <small>{dateTimeBR(order.created_at)}</small></td>
     <td>{order.status==='paid'?'Pago (manual)':'Em separação'}</td>
     <td>{check.registered_volumes}/{check.expected_volumes||'—'}</td>
     <td>{check.complete_for_manual_review?
      <span className="ops-tag status-paid">Conferido estruturalmente</span>:
      <span className="ops-tag status-pending">Incompleto</span>}</td>
     <td>{draft&&isShippingProvider(draft.provider)?
      <><strong>{PROVIDERS[draft.provider].label}</strong><small>Rascunho v{draft.revision}</small></>:
      'Não selecionado'}</td>
     <td>{check.issues.length?check.issues.slice(0,2).join(' · ')+
      (check.issues.length>2?' · +'+(check.issues.length-2):''):
      'Sem pendências estruturais'}</td>
     <td><Link className="ops-small primary" href={'/admin/logistica/volumes/'+order.id}>
      <Package size={15}/> Preparar</Link></td>
    </tr>)}</tbody>
   </table>
   {!rows.length?<div className="admin-empty"><Package size={32}/>
    <h3>Nenhum pedido disponível para preparar</h3>
    <p>Pedidos administrativos pagos ou em separação aparecerão aqui. Não alteramos pedidos existentes automaticamente.</p>
    <Link className="admin-outline" href="/admin/pedidos">Ver pedidos</Link>
   </div>:null}
  </div>
 </div>;
}
