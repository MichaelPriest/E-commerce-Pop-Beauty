/** Carrinho local é só uma prévia, nunca fonte de preço ou disponibilidade. */
export type CartItem={
 id:string;slug:string;name:string;price_cents:number;qty:number;
 variant_id?:string;variant_name?:string;sku?:string;emoji?:string
};
const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const trim=(value:unknown,max:number)=>typeof value==='string'?value.slice(0,max):'';
export function cartIdentity(item:Pick<CartItem,'id'|'variant_id'>){
 return item.id+':'+(item.variant_id??'default');
}
export function normalizeCart(raw:unknown):CartItem[]{
 if(!Array.isArray(raw))return [];
 const byKey=new Map<string,CartItem>();
 for(const value of raw.slice(0,60)){
  if(!value||typeof value!=='object'||Array.isArray(value))continue;
  const v=value as Record<string,unknown>;
  if(typeof v.id!=='string'||!uuid.test(v.id)||
   !Number.isInteger(v.qty)||Number(v.qty)<1||Number(v.qty)>99)continue;
  const variant_id=v.variant_id;
  if(variant_id!==undefined&&variant_id!==null&&variant_id!==''&&
   (typeof variant_id!=='string'||!uuid.test(variant_id)))continue;
  const item:CartItem={
   id:v.id,slug:trim(v.slug,160),name:trim(v.name,160)||'Produto',
   price_cents:Number.isInteger(v.price_cents)&&Number(v.price_cents)>=0
    &&Number(v.price_cents)<=100000000?Number(v.price_cents):0,
   qty:Number(v.qty),
   ...(typeof variant_id==='string'&&variant_id?{variant_id}:{}),
   ...(typeof v.variant_name==='string'?{variant_name:trim(v.variant_name,100)}:{}),
   ...(typeof v.sku==='string'?{sku:trim(v.sku,80)}:{}),
   ...(typeof v.emoji==='string'?{emoji:trim(v.emoji,12)}:{})
  };
  const key=cartIdentity(item);
  const existing=byKey.get(key);
  if(existing)existing.qty=Math.min(99,existing.qty+item.qty);
  else if(byKey.size<30)byKey.set(key,item);
 }
 return [...byKey.values()];
}
export function putCartItem(items:CartItem[],added:CartItem):CartItem[]{
 const normalized=normalizeCart(items);
 const next=normalizeCart([added])[0];
 if(!next)return normalized;
 const index=normalized.findIndex(item=>cartIdentity(item)===cartIdentity(next));
 if(index>=0){
  normalized[index]={...normalized[index],qty:Math.min(99,normalized[index].qty+next.qty)};
 }else if(normalized.length<30)normalized.push(next);
 return normalized;
}
export function cartApiItems(items:CartItem[]){
 return items.map(item=>({
  product_id:item.id,quantity:item.qty,
  ...(item.variant_id?{variant_id:item.variant_id}:{})
 }));
}
