import type {CartItem} from './cart-core';
export type CartSnapshotLine={product_id:string;variant_id:string|null;quantity:number};
export type SavedCartRow={
 user_id:string;items:CartSnapshotLine[];item_count:number;
 last_activity_at:string;created_at:string;
 reminders_opt_in:boolean;review_state:'new'|'reviewing'|'closed';
 reviewed_at:string|null;
};
export const ABANDONMENT_MINUTES=60;
export const CART_RETENTION_DAYS=30;
export function cartSnapshot(items:CartItem[]):CartSnapshotLine[]{
 return items.map(item=>({
  product_id:item.id,variant_id:item.variant_id??null,quantity:item.qty
 }));
}
export function cartSnapshotKey(items:CartSnapshotLine[]):string{
 return JSON.stringify(items.map(i=>[i.product_id,i.variant_id??null,i.quantity]));
}
export function cartIsInactive(lastActivity:string,at=Date.now()):boolean{
 const stamp=Date.parse(lastActivity);
 return Number.isFinite(stamp)&&stamp<=at-ABANDONMENT_MINUTES*60_000
  &&stamp>=at-CART_RETENTION_DAYS*86_400_000;
}
export function cartHasLaterOrder(lastActivity:string,createdAts:string[]):boolean{
 const stamp=Date.parse(lastActivity);
 return createdAts.some(value=>Number.isFinite(Date.parse(value))&&Date.parse(value)>=stamp);
}
export function cartCurrentSubtotal(lines:CartSnapshotLine[],prices:Map<string,number>):number{
 return lines.reduce((total,item)=>total+
  ((prices.get(item.product_id)??0)*item.quantity),0);
}
export function cartRecoveryStatus(row:SavedCartRow,createdAts:string[],
 at=Date.now()):'closed'|'ordered'|'active'|'abandoned'{
 if(row.review_state==='closed')return 'closed';
 if(cartHasLaterOrder(row.last_activity_at,createdAts))return 'ordered';
 return row.item_count>0&&cartIsInactive(row.last_activity_at,at)?
  'abandoned':'active';
}
