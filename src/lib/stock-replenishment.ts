/** Planejamento de reposição somente leitura, sem entrada de estoque.
 * Disponível vendável leva em conta reservas e validade dos lotes.
 */
export type ReplenishmentVariant={
 id:string;sku:string;ean:string|null;name:string;shade:string|null;active:boolean;
 products:{id:string;name:string;brand:string;active:boolean}|null;
 inventory:{on_hand:number;reserved:number;safety_stock:number}|null;
 inventory_lots:{lot_code:string;on_hand:number;expires_at:string|null}[]
};
export type ReplenishmentRow={
 id:string;sku:string;ean:string|null;product:string;shade:string;
 physical:number;reserved:number;validLots:number;available:number;
 minimum:number;expiring:number;expired:number;
 suggested:number;active:boolean
};
export function computeReplenishment(
 input:ReplenishmentVariant[],today:string,coverage=2
):ReplenishmentRow[]{
 const factor=Math.max(1,Math.min(4,Math.floor(coverage)));
 return input.map(v=>{
  const physical=v.inventory?.on_hand??0;
  const reserved=v.inventory?.reserved??0;
  const minimum=v.inventory?.safety_stock??0;
  const validLots=(v.inventory_lots??[]).filter(l=>
   l.on_hand>0&&(!l.expires_at||l.expires_at>=today));
  const validQuantity=validLots.reduce((s,l)=>s+l.on_hand,0);
  const available=Math.max(0,Math.min(physical-reserved,validQuantity-reserved));
  const expired=(v.inventory_lots??[]).filter(l=>l.on_hand>0&&
   l.expires_at!==null&&l.expires_at<today)
   .reduce((s,l)=>s+l.on_hand,0);
  const threshold=minimum||1;
  const active=v.active&&(v.products?.active??false);
  // Não recomendar compra de produtos ou SKUs desativados.
  const suggested=active?Math.max(0,threshold*factor-available):0;
  return {
   id:v.id,sku:v.sku,ean:v.ean,product:v.products?.name??'Produto removido',
   shade:v.shade||v.name,physical,reserved,validLots:validQuantity,
   available,minimum,expired,expiring:0,suggested,
   active
  };
 }).sort((a,b)=>Number(b.suggested>0)-Number(a.suggested>0)||
  b.suggested-a.suggested||a.product.localeCompare(b.product,'pt-BR'));
}
export function escapeReplenishmentCell(value:unknown){
 const str=String(value??'');
 const sanitized=/^[\s]*[=+@\-]/.test(str)?"'"+str:str;
 return '"'+sanitized.replaceAll('"','""')+'"';
}
export function replenishmentCsv(rows:ReplenishmentRow[]){
 const header=['Produto','SKU','EAN','Variação','Disponível',
  'Estoque mínimo','Sugestão de compra'];
 const body=rows.filter(row=>row.suggested>0).map(row=>[
  row.product,row.sku,row.ean??'',row.shade,row.available,row.minimum,row.suggested
 ]);
 return '\ufeff'+[header,...body].map(row=>
  row.map(escapeReplenishmentCell).join(';')).join('\r\n')+'\r\n';
}
