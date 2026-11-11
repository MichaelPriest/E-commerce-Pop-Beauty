import 'server-only';
import {meliGET,shopeeShopGET,type MarketplaceChannel} from './provider-auth';

type Raw=Record<string,unknown>;
export type MarketplaceImportedRow={
 kind:'listing'|'order';external_id:string;title:string;sku:string;
 external_status:string;amount_cents:number|null;quantity:number|null;
};
const obj=(v:unknown):Raw=>v&&typeof v==='object'&&!Array.isArray(v)?v as Raw:{};
const arr=(v:unknown):Raw[]=>Array.isArray(v)?v.map(obj):[];
const str=(v:unknown,limit=100)=>typeof v==='string'?v.slice(0,limit):String(
 typeof v==='number'&&Number.isSafeInteger(v)?v:'').slice(0,limit);
const id=(v:unknown)=>str(v).trim();
function cents(v:unknown):number|null{
 const raw=typeof v==='number'||typeof v==='string'?String(v):'';
 if(!/^\d{1,8}(?:\.\d{1,2})?$/.test(raw))return null;
 const result=Math.round(Number(raw)*100);
 return Number.isSafeInteger(result)?result:null;
}
function qty(v:unknown){const n=Number(v);return Number.isSafeInteger(n)&&n>=0&&n<=1000000?n:null;}

export async function readMarketplacePage(
 channel:MarketplaceChannel,accountId:string,token:string,kind:'listing'|'order'
):Promise<MarketplaceImportedRow[]>{
 if(channel==='mercadolivre'){
  if(!/^[1-9][0-9]{1,20}$/.test(accountId))throw new Error('ID do vendedor inválido.');
  if(kind==='order'){
   const response=await meliGET('/orders/search?seller='+accountId+'&sort=date_desc&limit=20',token);
   return arr(response.results).slice(0,20).map(o=>({
    kind:'order' as const,external_id:id(o.id),title:'',
    sku:'',external_status:str(o.status,80),
    amount_cents:cents(o.total_amount),
    quantity:arr(o.order_items).reduce((sum,i)=>sum+(qty(i.quantity)??0),0)
   })).filter(x=>x.external_id.length>0);
  }
  const response=await meliGET('/users/'+accountId+'/items/search?limit=30&offset=0',token);
  const ids=Array.isArray(response.results)?response.results.map(id).filter(Boolean).slice(0,30):[];
  if(!ids.length)return [];
  const details=await meliGET('/items/bulk?ids='+ids.join(','),token);
  const rows=Array.isArray(details)?details:arr(details);
  const indexed=new Map(rows.map(item=>{
   const body=obj(item.body??item);
   return [id(body.id),body] as const;
  }));
  return ids.map(external_id=>{
   const o=indexed.get(external_id)??{};
   return {kind:'listing' as const,external_id,title:str(o.title,200),
    sku:str(o.seller_custom_field,100),external_status:str(o.status,80),
    amount_cents:cents(o.price),quantity:qty(o.available_quantity)};
  });
 }
 if(kind==='order'){
  const now=Math.floor(Date.now()/1000);
  const response=await shopeeShopGET('/api/v2/order/get_order_list',token,accountId,{
   time_range_field:'update_time',
   time_from:String(now-7*86400),time_to:String(now),page_size:'20',
   response_optional_fields:'order_status'
  });
  const orders=arr(obj(response.response).order_list).slice(0,20);
  return orders.map(o=>({
   kind:'order' as const,external_id:id(o.order_sn),title:'',sku:'',
   external_status:str(o.order_status,80),amount_cents:null,quantity:null
  })).filter(x=>x.external_id.length>0);
 }
 const response=await shopeeShopGET('/api/v2/product/get_item_list',token,accountId,{
  item_status:['NORMAL'],offset:'0',page_size:'30'
 });
 const listings=arr(obj(response.response).item).slice(0,30);
 if(!listings.length)return [];
 const ids=listings.map(i=>id(i.item_id)).filter(Boolean);
 const details=await shopeeShopGET('/api/v2/product/get_item_base_info',token,accountId,{
  item_id_list:ids.join(',')
 });
 const info=new Map(arr(obj(details.response).item_list).map(item=>
  [id(item.item_id),item] as const));
 return listings.map(x=>{
  const external_id=id(x.item_id),item=info.get(external_id)??{};
  return {kind:'listing' as const,external_id,
   title:str(item.item_name,200),sku:str(item.item_sku,100),
   external_status:str(x.item_status,80),
   amount_cents:null,quantity:null};
 }).filter(x=>x.external_id.length>0);
}
