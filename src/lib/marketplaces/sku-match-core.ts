/** Conciliação informativa. Nunca altera estoque ou vínculos automaticamente. */
export type SkuCandidate={sku:string;isAdult:boolean};
export type SkuMatch='matched'|'missing'|'unmatched'|'ambiguous'|'adult_blocked';
export function classifyMarketplaceSku(
 externalSku:string|null|undefined,localSkus:ReadonlyArray<SkuCandidate>
):SkuMatch{
 const key=String(externalSku??'').trim().toLocaleUpperCase('pt-BR');
 if(!key)return 'missing';
 // Igualdade exata do SKU normalizado; nunca similaridade textual.
 const matches=localSkus.filter(item=>
  item.sku.trim().toLocaleUpperCase('pt-BR')===key);
 if(matches.length===0)return 'unmatched';
 if(matches.some(item=>item.isAdult))return 'adult_blocked';
 if(matches.length!==1)return 'ambiguous';
 return 'matched';
}
