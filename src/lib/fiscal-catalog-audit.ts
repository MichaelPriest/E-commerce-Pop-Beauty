/** Checklist de preenchimento fiscal PRELIMINAR.
 * Não substitui conferência tributária de contador, SEFAZ ou autorização NF-e.
 */
export type FiscalAuditProduct={
 id:string;name:string;brand:string;is_adult:boolean;active:boolean;
 product_fiscal_details:Record<string,unknown>|Record<string,unknown>[]|null
};
export type FiscalAuditLine={
 id:string;name:string;brand:string;active:boolean;
 missing:string[];readyForReview:boolean
};
const value=(source:Record<string,unknown>,name:string)=>
 source[name]===null||source[name]===undefined?'':String(source[name]).trim();
export function auditFiscalCatalog(
 products:FiscalAuditProduct[],taxRegime:number|null
):FiscalAuditLine[]{
 const base:[string,string][]=[
  ['ncm','NCM'],['tax_origin','Origem'],['commercial_unit','Unidade'],
  ['cfop_sale','CFOP de referência'],['pis_cst','CST PIS'],
  ['cofins_cst','CST COFINS']
 ];
 const taxCode:[string,string]|null=taxRegime===1||taxRegime===4?
  ['csosn','CSOSN']:taxRegime===2||taxRegime===3?
   ['icms_cst','CST ICMS']:null;
 return products.map(product=>{
  const raw=product.product_fiscal_details;
  const record=(Array.isArray(raw)?raw[0]:raw)??{};
  const missing=base.filter(([field])=>!value(record,field))
   .map(([,label])=>label);
  if(taxCode&&!value(record,taxCode[0]))missing.push(taxCode[1]);
  if(!taxCode)missing.push('Regime do emitente a conferir');
  return {
   id:product.id,name:product.name,brand:product.brand,active:product.active,
   missing,readyForReview:missing.length===0
  };
 });
}
export function csvCellSafe(value:unknown){
 const str=String(value??'');
 // Impede que dados de usuários sejam executados como fórmulas pelo Excel.
 const escaped=/^\s*[=+@\-\t\r]/.test(str)?"'"+str:str;
 return '"'+escaped.replaceAll('"','""')+'"';
}
export function fiscalAuditCsv(rows:FiscalAuditLine[]){
 const data=[['Produto','Marca','Publicado','Campos pendentes'],
  ...rows.filter(row=>row.missing.length>0).map(row=>[
   row.name,row.brand,row.active?'Sim':'Não',row.missing.join(', ')
  ])];
 return '\ufeff'+data.map(row=>row.map(csvCellSafe).join(';')).join('\r\n')+'\r\n';
}
