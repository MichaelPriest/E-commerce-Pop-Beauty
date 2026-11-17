import type {CheckoutPreviewLine} from './checkout-preview';

export type CheckoutDeliveryRate = {
 id:string; name:string; cep_start:string; cep_end:string; price_cents:number;
 delivery_days:number; active:boolean; revision:string;
};

export type CheckoutDeliveryOption = Pick<CheckoutDeliveryRate,'id'|'name'|'price_cents'|'delivery_days'|'revision'> & {
 address_version:string;
};

export type CheckoutDeliveryOrder = {
 order_id:string;
 status:string;
 expires_at:string|null;
 subtotal_cents:number;
 delivery_fee_cents:number;
 total_cents:number;
 delivery_name:string;
 checkout_url?:string;
 payment_error?:string;
};

export function checkoutDeliveryItems(lines:CheckoutPreviewLine[]){
 return lines.map(line=>{
  if(line.status!=='ready'||!line.variant_id||line.unit_price_cents===null){
   throw new Error('Confira as variações e os preços dos itens antes de reservar.');
  }
  return {
   product_id:line.product_id,variant_id:line.variant_id,quantity:line.quantity,
   unit_price_cents:line.unit_price_cents
  };
 });
}

export function deliveryDeadline(days:number){
 return days===0?'Entrega no mesmo dia':days===1?'Até 1 dia útil':'Até '+days+' dias úteis';
}
