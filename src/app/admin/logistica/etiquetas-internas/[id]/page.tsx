import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ArrowLeft,Package,Printer,ShieldAlert} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {checkShipmentPreparation,type PreparedVolume,type ShippingDestination}
 from '@/lib/shipping/shipment-preparation';
import {PrintButton} from '@/app/admin/fiscal/documentos/[id]/print-button';
import './labels.css';

export const dynamic='force-dynamic';
export const metadata={title:'Etiquetas internas por volume | Popê Beauty'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean=(x:unknown)=>typeof x==='string'?x.trim():'';
export default async function InternalParcelLabels({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!uuid.test(id))notFound();
 const sb=await requireAdmin();
 const [order,packing,packages,origin]=await Promise.all([
  sb.from('orders').select('id,origin,status,created_at,shipping_address_snapshot')
   .eq('id',id).eq('origin','admin_manual').maybeSingle(),
  sb.from('internal_package_preparations').select('volumes')
   .eq('order_id',id).maybeSingle(),
  sb.from('internal_package_volumes')
   .select('volume_number,weight_g,height_cm,width_cm,length_cm,contents_note')
   .eq('order_id',id).order('volume_number'),
  sb.from('shipping_origin_settings').select('origin_postal_code')
   .eq('id',1).maybeSingle()
 ]);
 if(order.error||!order.data)notFound();
 if(packing.error||packages.error||origin.error)
  throw new Error('Não foi possível conferir as etiquetas internas.');
 const destination=order.data.shipping_address_snapshot as ShippingDestination|null;
 const rows:PreparedVolume[]=(packages.data??[]).map(x=>({
  volume_number:x.volume_number,weight_g:x.weight_g,
  height_cm:Number(x.height_cm),width_cm:Number(x.width_cm),
  length_cm:Number(x.length_cm),contents_note:x.contents_note
 }));
 const review=checkShipmentPreparation({
  origin:order.data.origin,status:order.data.status,
  originPostalCode:origin.data?.origin_postal_code??null,
  destination,plannedVolumes:packing.data?.volumes??null,volumes:rows
 });
 const fullStreet=[clean(destination?.street),clean(destination?.house_number)]
  .filter(Boolean).join(', ');
 const cityState=[clean(destination?.city),clean(destination?.state_code)]
  .filter(Boolean).join(' / ');
 return <main className="pope-label-document">
  <div className="pope-label-toolbar">
   <Link href={'/admin/logistica/volumes/'+id} className="admin-outline">
    <ArrowLeft size={16}/> Voltar à conferência</Link>
   {review.complete_for_manual_review?<PrintButton/>:null}
  </div>
  <div className="pope-label-intro">
   <h1><Package size={25}/> Etiquetas de identificação interna — Popê Beauty</h1>
   <p><ShieldAlert size={16}/> Uso exclusivo de separação e identificação no estoque.
    <strong> Não é etiqueta dos Correios ou Melhor Envio, não possui código de
     rastreamento e não comprova postagem.</strong></p>
  </div>
  {!review.complete_for_manual_review?<div className="container">
   <p className="form-error">Impressão interna bloqueada. Corrija os dados da remessa.</p>
   <ul>{review.issues.map((item,i)=><li key={i}>{item}</li>)}</ul>
   <Link href={'/admin/logistica/volumes/'+id} className="admin-outline">
    Completar preparação do pedido</Link>
  </div>:<section className="pope-label-sheets">
   {rows.map(pkg=><article className="pope-label-sheet" key={pkg.volume_number}>
    <div className="pope-label-brand">
     <strong>POPÊ BEAUTY</strong><span>CONTROLE DE EXPEDIÇÃO</span>
    </div>
    <div className="pope-label-alert">
     ETIQUETA INTERNA • NÃO VÁLIDA PARA POSTAGEM
    </div>
    <div className="pope-label-block">
     <small>PEDIDO ADMINISTRATIVO</small>
     <strong>#{id.slice(0,8).toUpperCase()}</strong>
     <span>Identificação interna · sem objeto postal</span>
    </div>
    <div className="pope-label-volume">
     <span>VOLUME</span><strong>{pkg.volume_number} de {review.expected_volumes}</strong>
    </div>
    <div className="pope-label-block">
     <small>DESTINATÁRIO · CONFERIR COM O PEDIDO</small>
     <strong>{clean(destination?.recipient)}</strong>
     <span>{fullStreet}</span>
     {destination?.complement?<span>{clean(destination.complement)}</span>:null}
     <span>{clean(destination?.district)}</span>
     <span>{cityState}</span>
     <span>CEP: {clean(destination?.postal_code)}</span>
    </div>
    <div className="pope-label-specs">
     <div><small>PESO BRUTO</small><strong>{(pkg.weight_g/1000).toLocaleString('pt-BR',{maximumFractionDigits:3})} kg</strong></div>
     <div><small>DIMENSÕES (A × L × C)</small>
      <strong>{pkg.height_cm} × {pkg.width_cm} × {pkg.length_cm} cm</strong></div>
    </div>
    <div className="pope-label-footer">
     USO INTERNO — NÃO É SEDEX, PAC, PLP, NF-e NEM ETIQUETA DE TRANSPORTADORA.
     Não utilizar para postagem ou coleta.
    </div>
   </article>)}
  </section>}
 </main>;
}
