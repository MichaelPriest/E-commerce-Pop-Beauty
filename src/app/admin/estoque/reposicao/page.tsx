import Link from 'next/link';
import {ArrowLeft,ClipboardList} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {ReplenishmentManager} from './replenishment-manager';
import type {ReplenishmentVariant} from '@/lib/stock-replenishment';
export const dynamic='force-dynamic';
export const metadata={title:'Reposição de estoque | Popê Beauty'};
export default async function ReplenishmentPage(){
 const sb=await requireAdmin();
 const {data,error,count}=await sb.from('variants')
  .select('id,sku,ean,name,shade,active,products(id,name,brand,active),inventory(on_hand,reserved,safety_stock),inventory_lots(lot_code,on_hand,expires_at)',
   {count:'exact'})
  .order('sku',{ascending:true}).limit(1000);
 if(error)throw new Error('Não foi possível calcular a reposição de estoque.');
 return <div className="container admin-workspace pope-replenishment-admin">
  <div className="admin-top">
   <div><div className="section-kicker">POPÊ BEAUTY • ESTOQUE</div>
    <h1><ClipboardList size={27}/> Planejamento de reposição</h1>
    <p>Revise o que precisa ser comprado com base no estoque disponível, reservas e lotes válidos.</p>
   </div>
   <div className="pope-receipt-links">
    <Link href="/admin/estoque" className="admin-outline"><ArrowLeft size={16}/> Estoque e movimentações</Link>
    <Link href="/admin/estoque/compras" className="admin-outline">Pedidos de compra</Link>
   </div>
  </div>
  <ReplenishmentManager items={(data??[]) as unknown as ReplenishmentVariant[]}
   truncated={(count??0)>1000}/>
 </div>;
}
