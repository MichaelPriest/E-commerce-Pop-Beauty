/** Regras simples de conferência de entrada de mercadorias.
 * Validação definitiva ocorre novamente no PostgreSQL.
 */
export type ReceiptLine={
 variant_id:string;sku:string;product:string;shade:string;
 lot_code:string;expires_at:string;quantity:string;unit_cost:string
};
export function receiptLineKey(line:Pick<ReceiptLine,'variant_id'|'lot_code'>){
 return line.variant_id+':'+line.lot_code.trim();
}
export function parseUnitCost(value:string):number|null{
 const v=value.trim();
 if(!v)return null;
 if(!/^[0-9]{1,7}([,.][0-9]{1,2})?$/.test(v))
  throw new Error('Custo unitário inválido: use 12,50.');
 const n=Math.round(Number(v.replace(',','.'))*100);
 if(!Number.isSafeInteger(n)||n<0||n>100000000)
  throw new Error('Custo fora do limite.');
 return n;
}
export function validateReceiptLines(
 lines:ReceiptLine[],today:string
):string[]{
 const errors:string[]=[];
 if(lines.length<1||lines.length>25)errors.push('O recebimento exige 1 a 25 itens.');
 const seen=new Set<string>();
 lines.forEach((line,i)=>{
  const label='Item '+(i+1)+': ';
  if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(line.variant_id))
   errors.push(label+'SKU não identificado.');
  if(line.lot_code.trim().length<1||line.lot_code.trim().length>60)
   errors.push(label+'informe um lote de até 60 caracteres.');
  if(!/^[1-9][0-9]*$/.test(line.quantity)||
   !Number.isSafeInteger(Number(line.quantity))||Number(line.quantity)>100000)
   errors.push(label+'quantidade deve ser de 1 a 100.000.');
  if(line.expires_at && (line.expires_at<today||
   !/^\d{4}-\d{2}-\d{2}$/.test(line.expires_at)))
   errors.push(label+'validade vencida ou inválida.');
  try{parseUnitCost(line.unit_cost);}
  catch(err){errors.push(label+(err instanceof Error?err.message:'custo inválido'));}
  const key=receiptLineKey(line);
  if(seen.has(key))errors.push(label+'SKU e lote repetidos.');
  seen.add(key);
 });
 return errors;
}
export function goodsReceiptPayload(
 supplierId:string,supplierLabel:string,reference:string,
 documentDate:string,notes:string,lines:ReceiptLine[]
){
 return {
  supplier_id:supplierId||null,supplier_label:supplierLabel.trim(),
  reference:reference.trim(),document_date:documentDate||null,notes:notes.trim(),
  items:lines.map(line=>({
   variant_id:line.variant_id,lot_code:line.lot_code.trim(),
   quantity:Number(line.quantity),expires_at:line.expires_at||null,
   unit_cost_cents:parseUnitCost(line.unit_cost)
  }))
 };
}
