import {NextResponse,type NextRequest} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {providerPreparationReview,type ProviderDraft} from '@/lib/shipping/provider-adapters';
import {checkShipmentPreparation,type PreparedVolume,type ShippingDestination} from '@/lib/shipping/shipment-preparation';

export const dynamic='force-dynamic';
export const runtime='nodejs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers={
 'Cache-Control':'private, no-store, max-age=0',
 'Pragma':'no-cache',
 'X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer'
};
export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!uuid.test(id))return NextResponse.json({error:'Pedido inválido.'},{status:400,headers});
 const sb=await createClient();
 const {data:auth,error:authError}=await sb.auth.getClaims();
 if(authError||!auth?.claims?.sub)return NextResponse.json({error:'Faça login para continuar.'},{status:401,headers});
 const {data:profile,error:profileError}=await sb.from('profiles')
  .select('role').eq('id',auth.claims.sub).maybeSingle();
 if(profileError||profile?.role!=='admin')
  return NextResponse.json({error:'Acesso restrito ao administrador.'},{status:403,headers});
 const [order,packing,volumeRows,originSettings,providerDraft]=await Promise.all([
  sb.from('orders').select('id,origin,status,shipping_address_snapshot')
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
   .eq('order_id',id).maybeSingle()
 ]);
 if(order.error||!order.data)
  return NextResponse.json({error:'Pedido não encontrado.'},{status:404,headers});
 if(packing.error||volumeRows.error||originSettings.error||providerDraft.error)
  return NextResponse.json({error:'Falha ao consultar a preparação da remessa.'},{status:503,headers});
 const volumes:PreparedVolume[]=(volumeRows.data??[]).map(v=>({
  volume_number:v.volume_number,weight_g:v.weight_g,
  height_cm:Number(v.height_cm),width_cm:Number(v.width_cm),
  length_cm:Number(v.length_cm),contents_note:v.contents_note
 }));
 const destination=order.data.shipping_address_snapshot as ShippingDestination|null;
 const review=checkShipmentPreparation({
  origin:order.data.origin,status:order.data.status,
  originPostalCode:originSettings.data?.origin_postal_code??null,
  destination,plannedVolumes:packing.data?.volumes??null,volumes
 });
 if(!review.complete_for_manual_review){
  return NextResponse.json({error:'Remessa ainda não está preparada para conferência.',
   issues:review.issues,document_status:'not_submitted'},
   {status:409,headers});
 }
 const providerReview=providerPreparationReview({
  orderId:id,draft:providerDraft.data as ProviderDraft|null,check:review,volumes
 });
 const body={
  format:'pope.shipping.preparation.v1',
  is_official_shipping_label:false,
  document_status:'not_submitted',
  provider_request_performed:false,
  quotation_performed:false,
  shipment_purchased:false,
  tracking_created:false,
  ready_for_provider_review:providerReview.ready_for_internal_review,
  provider_review:providerReview,
  ready_for_label_purchase:false,
  requires_manual_fiscal_and_carrier_review:true,
  order_id:id,
  origin:{postal_code:String(originSettings.data!.origin_postal_code).trim()},
  destination:{
   recipient:destination?.recipient,phone:destination?.phone,
   postal_code:destination?.postal_code,street:destination?.street,
   house_number:destination?.house_number,complement:destination?.complement??null,
   district:destination?.district,city:destination?.city,
   state_code:destination?.state_code
  },
  packages:volumes,
  total_weight_g:review.total_weight_g,
  expected_volumes:review.expected_volumes,
  packing_notes:packing.data?.packing_notes??null
 };
 return new NextResponse(JSON.stringify(body,null,2),{
  headers:{...headers,'Content-Type':'application/json; charset=utf-8',
   'Content-Disposition':'attachment; filename="pope-remessa-preparacao-'+id.slice(0,8)+'.json"'}
 });
}
