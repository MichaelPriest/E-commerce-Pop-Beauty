import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ArrowLeft,ClipboardList,ShieldAlert} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {dateTimeBR} from '@/types/operations';
import {PrintButton} from '@/app/admin/fiscal/documentos/[id]/print-button';

export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default async function ShippingManifest({
 searchParams
}:{searchParams:Promise<{pedidos?:string}>}){
 const {pedidos}=await searchParams;
 const ids=(pedidos??'').split(',').filter(Boolean);
 if(ids.length<1||ids.length>30||new Set(ids).size!==ids.length||
  ids.some(id=>!uuid.test(id)))notFound();
 const sb=await requireAdmin();
 const {data,error}=await sb.from('orders')
  .select('id,origin,status,created_at,carrier,tracking_code,order_items(id,sku_snapshot,title_snapshot,quantity)')
  .in('id',ids).eq('origin','admin_manual')
  .in('status',['paid','packing','shipped','delivered']);
 if(error||!data||data.length!==ids.length)notFound();
 const byId=new Map(data.map(o=>[o.id,o]));
 const orders=ids.map(id=>byId.get(id)!);
 const volumeRows=await sb.from('internal_package_preparations')
  .select('order_id,volumes,weight_g').in('order_id',ids);
 if(volumeRows.error)throw new Error('Não foi possível carregar os volumes para conferência.');
 const packageByOrder=new Map((volumeRows.data??[]).map(x=>[x.order_id,x]));
 const totalVolumes=orders.reduce((sum,o)=>sum+(packageByOrder.get(o.id)?.volumes??1),0);
 const totalUnits=orders.reduce((sum,o)=>sum+(o.order_items??[]).reduce((s,i)=>s+i.quantity,0),0);
 return <div className="pope-print-document">
  <div className="pope-print-actions pope-print-header">
   <Link href="/admin/logistica" className="admin-outline"><ArrowLeft size={16}/> Logística</Link>
   <PrintButton/>
  </div>
  <article className="pope-print-sheet">
   <div className="pope-print-stamp">ROMANEIO INTERNO — SEM VALOR FISCAL OU POSTAL</div>
   <h1><ClipboardList size={25}/> Romaneio de separação e conferência</h1>
   <p className="pope-print-warning"><ShieldAlert size={17}/>
    Não é PLP, manifesto eletrônico de cargas, comprovante de postagem, documento fiscal ou coleta realizada.</p>
   <p><strong>Pedidos:</strong> {orders.length} · <strong>Volumes previstos:</strong> {totalVolumes}
    · <strong>Unidades:</strong> {totalUnits}</p>
   <table className="pope-print-table">
    <thead><tr><th>Conferido</th><th>Pedido</th><th>Data</th><th>Etapa</th><th>Volumes</th>
     <th>Transportadora</th><th>Rastreio manual</th><th>Itens</th></tr></thead>
    <tbody>{orders.map(o=><tr key={o.id}>
     <td>☐</td><td>#{o.id.slice(0,8).toUpperCase()}</td>
     <td>{dateTimeBR(o.created_at)}</td><td>{o.status}</td>
     <td>{packageByOrder.get(o.id)?.volumes??1}</td>
     <td>{o.carrier||'Pendente'}</td><td>{o.tracking_code||'Pendente'}</td>
     <td>{(o.order_items??[]).map(i=>i.sku_snapshot+' × '+i.quantity).join('; ')||'Sem itens'}</td>
    </tr>)}</tbody>
   </table>
   <div className="pope-print-section">
    <p>Separado por: __________________________ Data: ____/____/______</p>
    <p>Conferido por: _________________________ Hora: ____:____</p>
    <p>Entregue ao responsável: _________________________ Assinatura: _________________________</p>
   </div>
   <p className="pope-print-disclaimer">Impressão administrativa de controle interno. A inclusão neste romaneio
    não altera o status do pedido, não realiza baixa de estoque, não compra frete e não confirma despacho.</p>
  </article>
 </div>;
}
