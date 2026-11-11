import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ArrowLeft,Package} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {VolumeEditor} from './volume-editor';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default async function VolumesPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!uuid.test(id))notFound();
 const sb=await requireAdmin();
 const [order,prep,volumes]=await Promise.all([
  sb.from('orders').select('id,origin,status,created_at').eq('id',id).eq('origin','admin_manual').maybeSingle(),
  sb.from('internal_package_preparations').select('volumes,packing_notes').eq('order_id',id).maybeSingle(),
  sb.from('internal_package_volumes').select('volume_number,weight_g,height_cm,width_cm,length_cm,contents_note').eq('order_id',id).order('volume_number')
 ]);
 if(order.error||!order.data)notFound();
 if(prep.error||volumes.error)throw new Error('Não foi possível consultar o cadastro físico dos volumes.');
 const allowed=['paid','packing'].includes(order.data.status);
 return <div className="container admin-workspace pope-fiscal-area">
  <div className="admin-top"><div><div className="section-kicker">EXPEDIÇÃO • POPÊ BEAUTY</div>
   <h1><Package size={27}/> Medidas por volume</h1>
   <p>Pedido #{id.slice(0,8).toUpperCase()} · Status: {order.data.status}</p>
  </div><Link className="admin-outline" href="/admin/logistica"><ArrowLeft size={16}/> Logística</Link></div>
  <p className="ops-info">Cadastro interno para futura cotação e compra de frete.
   Não gera etiqueta oficial, código de rastreio nem despacho.</p>
  {!prep.data?<p className="form-error">Defina primeiro a quantidade de volumes em
   <Link href="/admin/fiscal"> Fiscal e etiquetas</Link>, na seção de preparação de embalagem.</p>:
   <VolumeEditor orderId={id} count={prep.data.volumes}
    editable={allowed} records={(volumes.data??[]).map(v=>({
     ...v,height_cm:Number(v.height_cm),width_cm:Number(v.width_cm),length_cm:Number(v.length_cm)
    }))}/>}
 </div>;
}
