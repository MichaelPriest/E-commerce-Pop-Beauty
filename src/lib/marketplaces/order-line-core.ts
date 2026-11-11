/** Itens de pedidos externos, reduzidos a dados de conferência sem PII. */
type Raw=Record<string,unknown>;
export type PreviewOrderLine={
 line_key:string;external_listing_id:string;external_variation_id:string;
 sku:string;title:string;quantity:number|null;unit_price_cents:number|null;
};
export type PreviewOrderGroup={order_id:string;lines:PreviewOrderLine[]};
const object=(v:unknown):Raw=>
 v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Raw:{};
const asText=(v:unknown,max:number):string=>{
 const raw=typeof v==='string'?v:
  typeof v==='number'&&Number.isSafeInteger(v)?String(v):'';
 return raw.trim().slice(0,max);
};
const id=(v:unknown)=>asText(v,100);
const amount=(v:unknown):number|null=>{
 const raw=typeof v==='number'||typeof v==='string'?String(v):'';
 if(!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(raw))return null;
 const cents=Math.round(Number(raw)*100);
 return Number.isSafeInteger(cents)&&cents<=5000000000?cents:null;
};
const qty=(v:unknown):number|null=>{
 const n=Number(v);
 return Number.isSafeInteger(n)&&n>=1&&n<=100000?n:null;
};
const lineKey=(i:number)=>String(i).padStart(3,'0');
function requireItems(value:unknown):Raw[]{
 if(!Array.isArray(value)||value.length>60)throw new Error('Itens do pedido indisponíveis ou excedem limite.');
 return value.map(object);
}
function validateOrders(groups:PreviewOrderGroup[]):PreviewOrderGroup[]{
 if(groups.length>20)throw new Error('Consulta de pedidos acima do limite.');
 const ids=new Set<string>();
 for(const g of groups){
  if(!g.order_id||g.order_id.length>100||ids.has(g.order_id))throw new Error('Pedido repetido ou inválido.');
  ids.add(g.order_id);
  if(g.lines.length>60)throw new Error('Pedido com itens demais.');
 }
 return groups;
}
export function normalizeMercadoLivreOrderLines(
 orders:unknown,expectedSellerId?:string
):PreviewOrderGroup[]{
 if(!Array.isArray(orders))throw new Error('Lista de pedidos do Mercado Livre inválida.');
 return validateOrders(orders.map((raw:unknown)=>{
  const order=object(raw), seller=object(order.seller);
  const sellerId=id(seller.id);
  if(expectedSellerId&&sellerId&&sellerId!==expectedSellerId)
   throw new Error('Pedido pertence a outro vendedor.');
  const lines=requireItems(order.order_items).map((rawItem,i)=>{
   const item=object(rawItem),product=object(item.item);
   return {
    line_key:lineKey(i),external_listing_id:id(product.id),
    external_variation_id:id(product.variation_id),
    sku:asText(product.seller_sku,100),
    title:asText(product.title,200),
    quantity:qty(item.quantity),
    unit_price_cents:amount(item.unit_price)
   };
  });
  return {order_id:id(order.id),lines};
 }));
}
export function normalizeShopeeOrderLines(
 details:unknown,requestedOrders:ReadonlyArray<string>
):PreviewOrderGroup[]{
 const payload=object(details),data=object(payload.response);
 if(!Array.isArray(data.order_list))throw new Error('Detalhes Shopee indisponíveis.');
 if(requestedOrders.length>20||requestedOrders.some(x=>!x))
  throw new Error('Lista de pedidos Shopee inválida.');
 const byId=new Map<string,Raw>();
 for(const raw of data.order_list){
  const row=object(raw),orderId=id(row.order_sn);
  if(!orderId||byId.has(orderId)||!requestedOrders.includes(orderId))
   throw new Error('Resposta Shopee com pedido inesperado ou repetido.');
  byId.set(orderId,row);
 }
 const groups=requestedOrders.map(order_id=>{
  const row=byId.get(order_id);
  if(!row)throw new Error('Shopee omitiu detalhes de um pedido solicitado.');
  const lines=requireItems(row.item_list).map((rawItem,i)=>{
   const item=object(rawItem);
   const modelId=id(item.model_id);
   // SKU pai NÃO identifica uma variação. Model SKU é obrigatório quando model_id>0.
   const sku=modelId&&modelId!=='0'?
    asText(item.model_sku,100):asText(item.item_sku,100);
   return {
    line_key:lineKey(i),external_listing_id:id(item.item_id),
    external_variation_id:modelId==='0'?'':modelId,
    sku,title:asText(item.item_name,200),
    quantity:qty(item.model_quantity_purchased),
    unit_price_cents:amount(item.model_discounted_price)
   };
  });
  return {order_id,lines};
 });
 return validateOrders(groups);
}
