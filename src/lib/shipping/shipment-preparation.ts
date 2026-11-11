/** Conferência documental de remessa interna. Não compra frete nem autoriza etiqueta postal. */
export type PreparedVolume={
 volume_number:number;weight_g:number;height_cm:number;width_cm:number;
 length_cm:number;contents_note?:string|null
};
export type ShippingDestination={
 recipient?:string|null;phone?:string|null;postal_code?:string|null;
 street?:string|null;house_number?:string|null;complement?:string|null;
 district?:string|null;city?:string|null;state_code?:string|null
};
export type ShipmentCheckInput={
 origin:string;status:string;originPostalCode:string|null;
 destination:ShippingDestination|null;plannedVolumes:number|null;
 volumes:PreparedVolume[];
};
export type ShipmentCheck={
 complete_for_manual_review:boolean;
 issues:string[];
 expected_volumes:number;
 registered_volumes:number;
 total_weight_g:number;
};
const digits=(value:unknown)=>String(value??'').replace(/\D/g,'');
const filled=(value:unknown)=>typeof value==='string'&&value.trim().length>0;
const validCentimeter=(value:unknown)=>{
 const n=Number(value);
 return value!==null&&value!==undefined&&value!==''&&Number.isFinite(n)&&n>0&&n<=300&&
  Math.abs(Math.round(n*100)-n*100)<1e-8;
};
export function checkShipmentPreparation(input:ShipmentCheckInput):ShipmentCheck{
 const issues:string[]=[];
 const {origin,status,destination,plannedVolumes,volumes}=input;
 if(origin!=='admin_manual')issues.push('Somente pedidos administrativos podem ser preparados.');
 if(!['paid','packing'].includes(status))
  issues.push('A conferência para futura etiqueta exige pedido pago ou em separação, antes do despacho.');
 if(digits(input.originPostalCode).length!==8)
  issues.push('Configure o CEP de origem da loja em Frete e embalagem.');
 if(!destination||!filled(destination.recipient))
  issues.push('Destinatário não informado no endereço do pedido.');
 const phone=digits(destination?.phone);
 if(phone.length!==10&&phone.length!==11)
  issues.push('Telefone do destinatário ausente ou inválido.');
 if(digits(destination?.postal_code).length!==8)
  issues.push('CEP de destino incompleto.');
 for(const [name,value] of [
  ['logradouro',destination?.street],['número',destination?.house_number],
  ['bairro',destination?.district],['cidade',destination?.city]
 ] as const){
  if(!filled(value))issues.push('Endereço de destino sem '+name+'.');
 }
 if(!/^[A-Z]{2}$/.test(String(destination?.state_code??'').trim().toUpperCase()))
  issues.push('UF do destinatário inválida.');
 const count=Number.isInteger(plannedVolumes)&&plannedVolumes!==null&&
  plannedVolumes>=1&&plannedVolumes<=50?plannedVolumes:0;
 if(count===0)issues.push('Cadastre a quantidade prevista de volumes na central fiscal.');
 if(count>0&&volumes.length!==count)
  issues.push('Existem '+volumes.length+' volumes registrados para '+count+' previstos.');
 const numbers=new Set<number>();
 let totalWeight=0;
 for(const item of volumes){
  if(!Number.isInteger(item.volume_number)||item.volume_number<1||
    item.volume_number>50||numbers.has(item.volume_number)){
   issues.push('Numeração de volumes duplicada ou inválida.');
  }else numbers.add(item.volume_number);
  if(!Number.isInteger(item.weight_g)||item.weight_g<1||item.weight_g>500000)
   issues.push('Existem volumes com peso bruto inválido.');
  else totalWeight+=item.weight_g;
  if(!validCentimeter(item.height_cm)||!validCentimeter(item.width_cm)||
    !validCentimeter(item.length_cm))
   issues.push('Existem volumes com dimensões inválidas.');
 }
 if(count>0){
  for(let i=1;i<=count;i++)if(!numbers.has(i)){
   issues.push('Preencha peso e dimensões do volume '+i+'.');
  }
  if([...numbers].some(n=>n>count))
   issues.push('Existem volumes excedentes que precisam de revisão.');
 }
 return {complete_for_manual_review:issues.length===0,issues,
  expected_volumes:count,registered_volumes:volumes.length,total_weight_g:totalWeight};
}
