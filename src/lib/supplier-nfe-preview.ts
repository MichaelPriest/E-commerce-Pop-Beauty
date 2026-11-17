/** Leitura LOCAL de dados de NF-e para conferência de mercadorias.
 * NÃO valida assinatura XML, situação SEFAZ nem autenticidade fiscal.
 * DTD/DOCTYPE e entidades externas não são aceitos.
 */
export type SupplierInvoiceItem={
 barcode:string;productCode:string;description:string;
 lotCode:string;expiresAt:string;quantity:number;unitCost:string
};
type DeclaredItem=Pick<SupplierInvoiceItem,'barcode'|'productCode'|'description'|'quantity'>;
export type SupplierInvoicePreview={
 issuer:string;issuerTaxId:string;document:string;date:string;
 declaredItems:DeclaredItem[];items:SupplierInvoiceItem[];warnings:string[]
};
const direct=(parent:Element|null,name:string):Element|null=>
 parent?Array.from(parent.children).find(el=>el.localName===name)??null:null;
const all=(parent:Element,name:string):Element[]=>
 Array.from(parent.getElementsByTagName('*')).filter(el=>el.localName===name);
const str=(parent:Element|null,name:string):string=>
 direct(parent,name)?.textContent?.trim()??'';
export function parseSupplierNfeXml(xml:string):SupplierInvoicePreview{
 if(!xml||xml.length>2_000_000)throw new Error('XML vazio ou acima de 2 MB.');
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))
  throw new Error('Declarações DTD e entidades não são permitidas.');
 const dom=new DOMParser().parseFromString(xml,'application/xml');
 if(dom.getElementsByTagName('parsererror').length)
  throw new Error('XML inválido; confira a estrutura do arquivo.');
 const infos=all(dom.documentElement,'infNFe');
 if(infos.length!==1)throw new Error('Arquivo não contém exatamente uma NF-e.');
 const inf=infos[0];
 const issue=direct(inf,'emit');
 const ide=direct(inf,'ide');
 if(!issue||!ide)throw new Error('Emissor ou identificação da NF-e não encontrado.');
 const issuer=str(issue,'xNome');
 const issuerTaxId=str(issue,'CNPJ')||str(issue,'CPF');
 const nnf=str(ide,'nNF'),series=str(ide,'serie');
 const date=(str(ide,'dhEmi')||str(ide,'dEmi')).slice(0,10);
 if(!issuer||!nnf)throw new Error('Dados básicos de fornecedor/NF-e incompletos.');
 const details=all(inf,'det');
 if(details.length<1||details.length>50)
  throw new Error('XML com quantidade de itens não suportada (1 a 50).');
 const items:SupplierInvoiceItem[]=[],declaredItems:DeclaredItem[]=[],warnings:string[]=[];
 for(const [index,detail] of details.entries()){
  const prod=direct(detail,'prod');
  if(!prod){warnings.push('Item '+(index+1)+' sem grupo prod.');continue;}
  const ean=str(prod,'cEAN');
  const barcode=/^SEM GTIN$/i.test(ean)?'':ean;
  const productCode=str(prod,'cProd'),description=str(prod,'xProd');
  const quantity=Number(str(prod,'qCom').replace(',','.'));
  const rawUnitCost=str(prod,'vUnCom');
  const rawCost=Number(rawUnitCost.replace(',','.'));
  const unitCost=Number.isFinite(rawCost)&&rawCost>=0&&rawCost<=1000000?
   (Math.round(rawCost*100)/100).toFixed(2).replace('.',','):'';
  if(rawUnitCost&&!unitCost)
   warnings.push('Item '+(index+1)+': custo unitário inválido, confira manualmente.');
  const trace=all(prod,'rastro');
  const traces=trace.length?trace:[null];
  const validQuantity=Number.isInteger(quantity)&&quantity>=1&&quantity<=100000;
  if(validQuantity)declaredItems.push({barcode,productCode,description,quantity});
  else warnings.push('Item '+(index+1)+': quantidade comercial fracionada ou inválida.');
  let tracedTotal=0;
  for(const t of traces){
   const tracedQty=t?Number(str(t,'qLote').replace(',','.')):quantity;
   if(!Number.isInteger(tracedQty)||tracedQty<=0||tracedQty>100000){
    if(t)warnings.push('Item '+(index+1)+': quantidade de lote fracionada ou inválida.');
    continue;
   }
   items.push({
    barcode,
    productCode,description,quantity:tracedQty,
    lotCode:t?str(t,'nLote')||'SEM-LOTE':'SEM-LOTE',
    expiresAt:t?str(t,'dVal'):'',
    unitCost
   });
   tracedTotal+=tracedQty;
  }
  if(trace.length&&validQuantity&&tracedTotal!==quantity)
   warnings.push('Item '+(index+1)+': a soma dos lotes difere da quantidade comercial da nota.');
 }
 if(items.length>25)
  warnings.push('A NF-e contém mais de 25 linhas; divida a conferência em recebimentos menores.');
 return {
  issuer,issuerTaxId,document:'NF-e '+nnf+(series?'/'+series:''),
  date:/^\d{4}-\d{2}-\d{2}$/.test(date)?date:'',
  declaredItems,items,warnings
 };
}
