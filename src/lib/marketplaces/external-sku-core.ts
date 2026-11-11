/** Extração conservadora: sem SKU inequívoco não sugerir vínculo de estoque. */
type Row=Record<string,unknown>;
function obj(v:unknown):Row{
 return v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
}
function items(v:unknown):Row[]{return Array.isArray(v)?v.map(obj):[];}
/** Seller SKU é atributo oficial, seller_custom_field NÃO é equivalência garantida. */
export function safeMercadoLivreListingSku(item:unknown):string{
 const o=obj(item);
 if(items(o.variations).length>0)return '';
 const attributes=items(o.attributes);
 const sku=attributes.find(a=>a.id==='SELLER_SKU');
 return typeof sku?.value_name==='string'?sku.value_name.trim().slice(0,100):'';
}
export function safeShopeeListingSku(item:unknown):string{
 const o=obj(item);
 if(o.has_model!==false)return '';
 return typeof o.item_sku==='string'?o.item_sku.trim().slice(0,100):'';
}
