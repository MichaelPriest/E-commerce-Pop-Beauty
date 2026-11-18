/** Regras determinísticas de simulação; NÃO debita pedidos nem autoriza pagamentos. */
export type PromotionCoupon={
 id:string;code:string;description:string;
 discount_type:'percent'|'fixed';discount_value:number;
 min_subtotal_cents:number;max_discount_cents:number|null;
 starts_at:string;ends_at:string;enabled:boolean;
 created_at:string;updated_at:string;
};
export type CouponQuote={
 eligible:boolean;discount_cents:number;total_cents:number;message:string;
};
const codePattern=/^[A-Z0-9][A-Z0-9_-]{3,23}$/;
export function normalizeCouponCode(raw:unknown):string{
 return typeof raw==='string'?raw.normalize('NFKC').trim().toUpperCase():'';
}
export function validCouponCode(raw:unknown):boolean{
 const code=normalizeCouponCode(raw);
 return codePattern.test(code);
}
export function validCouponConfig(coupon:PromotionCoupon):boolean{
 const cap=coupon.max_discount_cents;
 return validCouponCode(coupon.code)&&coupon.code===normalizeCouponCode(coupon.code)
  &&Number.isSafeInteger(coupon.min_subtotal_cents)
  &&coupon.min_subtotal_cents>=0&&coupon.min_subtotal_cents<=100000000
  &&(cap===null||(Number.isSafeInteger(cap)&&cap>0&&cap<=100000000))
  &&(coupon.discount_type==='percent'
   ?Number.isInteger(coupon.discount_value)&&coupon.discount_value>=1
    &&coupon.discount_value<=90
   :coupon.discount_type==='fixed'
    ?Number.isInteger(coupon.discount_value)&&coupon.discount_value>=100
    &&coupon.discount_value<=100000000&&cap===null
    :false);
}
export function promotionCouponQuote(
 coupon:PromotionCoupon,subtotalCents:number,at:Date=new Date()
):CouponQuote{
 const bad=(message:string):CouponQuote=>({
  eligible:false,discount_cents:0,total_cents:subtotalCents,message
 });
 if(!Number.isSafeInteger(subtotalCents)||subtotalCents<0||subtotalCents>100000000)
  return {eligible:false,discount_cents:0,total_cents:0,message:'Subtotal inválido.'};
 if(!validCouponConfig(coupon))return bad('Cadastro do cupom inválido.');
 if(!coupon.enabled)return bad('Cupom inativo.');
 const start=Date.parse(coupon.starts_at),end=Date.parse(coupon.ends_at);
 const now=at.getTime();
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||!Number.isFinite(now))
  return bad('Período do cupom inválido.');
 if(now<start)return bad('Cupom ainda não iniciado.');
 if(now>=end)return bad('Cupom expirado.');
 if(subtotalCents<coupon.min_subtotal_cents)
  return bad('Subtotal abaixo do mínimo da campanha.');
 const raw=coupon.discount_type==='percent'
  ?Math.floor(subtotalCents*coupon.discount_value/100):coupon.discount_value;
 const discount=Math.min(subtotalCents,raw,
  coupon.max_discount_cents??subtotalCents);
 if(discount<=0)return bad('Subtotal insuficiente para o desconto.');
 return {eligible:true,discount_cents:discount,
  total_cents:subtotalCents-discount,
  message:'Simulação administrativa. Desconto ainda não aceito no checkout.'};
}
