import 'server-only';
import {meliGET,shopeeShopGET,type MarketplaceChannel} from './provider-auth';
import {
 encodeMarketplaceCursor,decodeMarketplaceCursor,type PageState
} from './pagination-core';

type Raw=Record<string,unknown>;
export type MarketplaceImportedRow={
 kind:'listing'|'order';external_id:string;title:string;sku:string;
 external_status:string;amount_cents:number|null;quantity:number|null;
};
export type MarketplacePage={rows:MarketplaceImportedRow[];nextCursor:string|null};
type Kind='listing'|'order';
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
function secret(){
 const raw=process.env.MARKETPLACE_TOKEN_ENCRYPTION_KEY??'';
 if(!/^[a-f0-9]{64}$/i.test(raw))throw new Error('Cofre de marketplaces indisponível.');
 return Buffer.from(raw,'hex');
}
function follow(state:PageState,offset:number,providerCursor=''):string|null{
 if(state.page>=9||offset<0||offset>500)return null;
 return encodeMarketplaceCursor({...state,offset,providerCursor,page:state.page+1},secret());
}
export async function readMarketplacePage(
 channel:MarketplaceChannel,accountId:string,token:string,kind:Kind,
 continuation?:string
):Promise<MarketplacePage>{
 if(!/^[1-9][0-9]{1,20}$/.test(accountId))throw new Error('Conta externa inválida.');
 const now=Math.floor(Date.now()/1000);
 const state:PageState=continuation?
  decodeMarketplaceCursor(continuation,secret(),{channel,kind,accountId},now):
  {channel,kind,accountId,offset:0,providerCursor:'',windowTo:now,page:0};

 if(channel==='mercadolivre'){
  const pageSize=kind==='listing'?30:20;
  const suffix='&limit='+pageSize+'&offset='+state.offset;
  if(kind==='order'){
   const response=await meliGET('/orders/search?seller='+accountId+
     '&sort=date_desc'+suffix,token);
   const rows=arr(response.results).slice(0,pageSize).map(o=>({
    kind:'order' as const,external_id:id(o.id),title:'',sku:'',
    external_status:str(o.status,80),amount_cents:cents(o.total_amount),
    quantity:arr(o.order_items).reduce((sum,i)=>sum+(qty(i.quantity)??0),0)
   })).filter(x=>x.external_id);
   const total=Number(obj(response.paging).total);
   const more=rows.length===pageSize&&
    (!Number.isFinite(total)||state.offset+pageSize<total);
   return {rows,nextCursor:more?follow(state,state.offset+pageSize):null};
  }
  const response=await meliGET('/users/'+accountId+
   '/items/search?limit='+pageSize+'&offset='+state.offset,token);
  const ids=Array.isArray(response.results)?
   response.results.map(id).filter(Boolean).slice(0,pageSize):[];
  if(!ids.length)return {rows:[],nextCursor:null};
  const details=await meliGET('/items/bulk?ids='+ids.join(','),token);
  const indexed=new Map(arr(details).map(item=>{
   const body=obj(item.body??item);
   return [id(body.id),body] as const;
  }));
  const rows=ids.map(external_id=>{
   const o=indexed.get(external_id)??{};
   return {kind:'listing' as const,external_id,title:str(o.title,200),
    sku:str(o.seller_custom_field,100),external_status:str(o.status,80),
    amount_cents:cents(o.price),quantity:qty(o.available_quantity)};
  });
  const total=Number(obj(response.paging).total);
  const more=ids.length===pageSize&&
   (!Number.isFinite(total)||state.offset+pageSize<total);
  return {rows,nextCursor:more?follow(state,state.offset+pageSize):null};
 }
 if(kind==='order'){
  const fields:Record<string,string>={
   time_range_field:'update_time',
   time_from:String(state.windowTo-7*86400),
   time_to:String(state.windowTo),page_size:'20',
   response_optional_fields:'order_status'
  };
  if(state.providerCursor){
   fields.cursor=Buffer.from(state.providerCursor,'base64url').toString('utf8');
  }
  const response=await shopeeShopGET('/api/v2/order/get_order_list',token,accountId,fields);
  const body=obj(response.response);
  const rows=arr(body.order_list).slice(0,20).map(o=>({
   kind:'order' as const,external_id:id(o.order_sn),title:'',sku:'',
   external_status:str(o.order_status,80),amount_cents:null,quantity:null
  })).filter(x=>x.external_id);
  const next=typeof body.next_cursor==='string'?body.next_cursor:'';
  const encoded=Buffer.from(next,'utf8').toString('base64url');
  const more=body.more===true&&next.length>0&&encoded.length<=200;
  return {rows,nextCursor:more?follow(state,0,encoded):null};
 }
 const response=await shopeeShopGET('/api/v2/product/get_item_list',token,accountId,{
  item_status:['NORMAL'],offset:String(state.offset),page_size:'30'
 });
 const body=obj(response.response);
 const listings=arr(body.item).slice(0,30);
 if(!listings.length)return {rows:[],nextCursor:null};
 const ids=listings.map(i=>id(i.item_id)).filter(Boolean);
 const details=await shopeeShopGET('/api/v2/product/get_item_base_info',token,accountId,{
  item_id_list:ids.join(',')
 });
 const indexed=new Map(arr(obj(details.response).item_list).map(item=>
  [id(item.item_id),item] as const));
 const rows=listings.map(x=>{
  const external_id=id(x.item_id),item=indexed.get(external_id)??{};
  return {kind:'listing' as const,external_id,
   title:str(item.item_name,200),sku:str(item.item_sku,100),
   external_status:str(x.item_status,80),
   amount_cents:null,quantity:null};
 }).filter(x=>x.external_id);
 const nextOffset=Number(body.next_offset);
 const more=body.has_next_page===true&&Number.isSafeInteger(nextOffset)&&
  nextOffset>state.offset;
 return {rows,nextCursor:more?follow(state,nextOffset):null};
}
