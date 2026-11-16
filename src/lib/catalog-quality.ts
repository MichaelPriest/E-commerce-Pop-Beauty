/** Diagnóstico administrativo somente leitura; não altera estoque/publicação. */
export type CatalogIssue='photo'|'description'|'price'|'sku'|'stock';
export type QualityVariant={
 active:boolean;sku:string;
 inventory:{on_hand:number;reserved:number;safety_stock:number}|null;
 inventory_lots?:{on_hand:number;expires_at:string|null}[];
};
export type QualityProduct={
 image_url:string|null;description:string;price_cents:number;
 variants:QualityVariant[];
};
export const CATALOG_ISSUE_LABELS:Record<CatalogIssue,string>={
 photo:'Foto pendente',
 description:'Descrição curta',
 price:'Preço inválido',
 sku:'SKU ausente',
 stock:'Sem estoque disponível'
};
export function catalogIssues(product:QualityProduct,today:string):CatalogIssue[]{
 const issues:CatalogIssue[]=[];
 if(!product.image_url?.trim())issues.push('photo');
 if(!product.description||product.description.trim().length<60)issues.push('description');
 if(!Number.isSafeInteger(product.price_cents)||product.price_cents<=0)issues.push('price');
 const variants=(product.variants??[]).filter(v=>v.active);
 if(!variants.length||variants.some(v=>!v.sku?.trim()))issues.push('sku');
 const sellable=variants.some(v=>{
  const i=v.inventory;
  if(!i||i.on_hand-i.reserved<=0)return false;
  const validLots=(v.inventory_lots??[]).filter(l=>
   l.on_hand>0&&(!l.expires_at||l.expires_at>=today));
  const quantity=validLots.reduce((sum,l)=>sum+l.on_hand,0);
  return quantity-i.reserved>0;
 });
 if(!sellable)issues.push('stock');
 return issues;
}
export function brazilTodayISO(date=new Date()){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',
  year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
