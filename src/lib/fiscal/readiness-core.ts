/** Verificações conservadoras de preparação de dados, NÃO autorização fiscal. */
export type FiscalIssuer={
 legal_name:string;cnpj:string;state_registration:string;tax_regime:number|null;
 state_code:string;city:string;city_ibge_code:string;postal_code:string;
 street:string;house_number:string;district:string;
};
export type FiscalTax={
 ncm:string|null;cest:string|null;tax_origin:number|null;commercial_unit:string|null;
 cfop_sale:string|null;icms_cst:string|null;csosn:string|null;
 pis_cst:string|null;cofins_cst:string|null;
 cst_ibs_cbs:string|null;class_trib_ibs_cbs:string|null;
};
export type FiscalItem={sku:string;quantity:number;priceCents:number;tax:FiscalTax|null};
export type FiscalRecipient={full_name:string;tax_id:string|null};
export function taxDigits(value:string|null|undefined,len:number){
 return new RegExp('^[0-9]{'+len+'}$').test(value??'');
}
export function isCnpjValid(value:string|null|undefined){
 const d=value??'';
 if(!taxDigits(d,14)||/^(\d)\1{13}$/.test(d))return false;
 const digit=(slice:number,weights:number[])=>{
  const sum=d.slice(0,slice).split('').reduce((s,v,i)=>s+Number(v)*weights[i],0);
  const mod=sum%11;return mod<2?0:11-mod;
 };
 return digit(12,[5,4,3,2,9,8,7,6,5,4,3,2])===Number(d[12])&&
  digit(13,[6,5,4,3,2,9,8,7,6,5,4,3,2])===Number(d[13]);
}
export function isCpfValid(value:string|null|undefined){
 const d=value??'';
 if(!taxDigits(d,11)||/^(\d)\1{10}$/.test(d))return false;
 for(let digit=9;digit<11;digit++){
  const sum=d.slice(0,digit).split('').reduce((s,v,i)=>s+Number(v)*(digit+1-i),0);
  const n=(sum*10)%11;
  if((n===10?0:n)!==Number(d[digit]))return false;
 }
 return true;
}
export function fiscalChecklist(input:{
 issuer:FiscalIssuer|null;recipient:FiscalRecipient|null;
 lines:FiscalItem[];model:'55'|'65';status:string;
 shippingAddressPresent:boolean;
}):string[]{
 const {issuer,recipient,lines,model,status,shippingAddressPresent}=input;
 const issues:string[]=[];
 if(!issuer||!issuer.legal_name?.trim()||!isCnpjValid(issuer.cnpj))
  issues.push('Razão social e CNPJ válido do emitente');
 if(!issuer?.state_registration?.trim()||!issuer?.tax_regime)
  issues.push('Inscrição estadual e regime tributário do emitente');
 if(!issuer?.city?.trim()||!taxDigits(issuer?.city_ibge_code,7)||
  !taxDigits(issuer?.postal_code,8)||!issuer?.street?.trim()||
  !issuer?.house_number?.trim()||!issuer?.district?.trim())
  issues.push('Endereço fiscal completo e município IBGE do emitente');
 if(!recipient?.full_name?.trim())
  issues.push('Destinatário identificado e conferido');
 if(model==='55'&&(!recipient?.tax_id||
  !(isCpfValid(recipient.tax_id)||isCnpjValid(recipient.tax_id))))
  issues.push('CPF/CNPJ válido do destinatário para NF-e 55 (verificar exceções com contador)');
 if(recipient?.tax_id&&!(isCpfValid(recipient.tax_id)||isCnpjValid(recipient.tax_id)))
  issues.push('CPF/CNPJ do destinatário inválido');
 if(model==='55'&&!shippingAddressPresent)
  issues.push('Endereço de entrega/destinatário não vinculado ao pedido');
 if(!['paid','packing','shipped','delivered'].includes(status))
  issues.push('Pedido sem confirmação administrativa de pagamento');
 if(!lines.length)issues.push('Pedido sem itens fiscais');
 for(const item of lines){
  const t=item.tax;
  if(!item.sku||!Number.isInteger(item.quantity)||item.quantity<=0||
   !Number.isSafeInteger(item.priceCents)||item.priceCents<0)
   issues.push('Item com SKU, quantidade ou valor inválido');
  if(!t||!taxDigits(t.ncm,8)||t.tax_origin===null||
   !t.commercial_unit||!taxDigits(t.cfop_sale,4))
   issues.push('NCM, origem, unidade e CFOP incompletos em um ou mais itens');
  if(t&&!t.icms_cst&&!t.csosn)
   issues.push('CST/CSOSN do ICMS não informado em um ou mais itens');
  if(t&&(!t.pis_cst||!t.cofins_cst))
   issues.push('CST PIS/COFINS não informado em um ou mais itens');
  if(issuer?.tax_regime===3&&t&&(!t.cst_ibs_cbs||!t.class_trib_ibs_cbs))
   issues.push('Classificação IBS/CBS não informada para CRT 3');
 }
 // Mesmo sem alertas básicos, parametrização tributária e certificação são externas.
 return [...new Set(issues)];
}

/** Reconciliação aritmética em centavos; não representa cálculo de tributos. */
export function fiscalAmountReconciliation(lines:Pick<FiscalItem,'quantity'|'priceCents'>[],orderTotalCents:number){
 const issues:string[]=[];
 if(!Number.isSafeInteger(orderTotalCents)||orderTotalCents<0)
  issues.push('Total do pedido inválido ou fora do intervalo seguro em centavos');
 let itemsTotalCents=0;
 for(const item of lines){
  if(!Number.isSafeInteger(item.quantity)||item.quantity<=0||
     !Number.isSafeInteger(item.priceCents)||item.priceCents<0){
   issues.push('Item com quantidade ou preço inválido para conciliação');
   continue;
  }
  const lineTotal=item.quantity*item.priceCents;
  if(!Number.isSafeInteger(lineTotal)||!Number.isSafeInteger(itemsTotalCents+lineTotal)){
   issues.push('Soma de itens excede o intervalo seguro em centavos');
   continue;
  }
  itemsTotalCents+=lineTotal;
 }
 const differenceCents=Number.isSafeInteger(orderTotalCents)&&
  Number.isSafeInteger(itemsTotalCents)?orderTotalCents-itemsTotalCents:null;
 if(differenceCents!==null&&differenceCents!==0)
  issues.push('Diferença entre itens e total do pedido: discriminar frete, desconto ou ajuste antes de emitir');
 return {items_total_cents:itemsTotalCents,
  difference_cents:differenceCents,issues:[...new Set(issues)]};
}
