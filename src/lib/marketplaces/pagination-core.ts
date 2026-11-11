import {createHmac,timingSafeEqual} from 'node:crypto';
export type CursorChannel='shopee'|'mercadolivre';
export type CursorKind='listing'|'order';
export type PageState={
 channel:CursorChannel;kind:CursorKind;accountId:string;
 offset:number;providerCursor:string;windowTo:number;page:number;
};
/** Cursor opaco autenticado, associado à conta, com expiração de 20 minutos. */
export function encodeMarketplaceCursor(
 state:PageState,key:Buffer,now=Math.floor(Date.now()/1000)
):string{
 if(key.length!==32||!isState(state,now)||state.page<1||state.page>10)
  throw new Error('Estado de paginação inválido.');
 const payload=Buffer.from(JSON.stringify({...state,expiresAt:now+1200})).toString('base64url');
 const signature=createHmac('sha256',key).update(payload).digest('base64url');
 return payload+'.'+signature;
}
export function decodeMarketplaceCursor(
 value:string,key:Buffer,scope:{channel:CursorChannel;kind:CursorKind;accountId:string},
 now=Math.floor(Date.now()/1000)
):PageState{
 if(key.length!==32||value.length>1000||value.length<30)
  throw new Error('Cursor de marketplace inválido.');
 const parts=value.split('.');
 if(parts.length!==2||!parts[0]||!/^[A-Za-z0-9_-]{43}$/.test(parts[1]))
  throw new Error('Cursor de marketplace inválido.');
 const expected=createHmac('sha256',key).update(parts[0]).digest();
 const actual=Buffer.from(parts[1],'base64url');
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))
  throw new Error('Cursor de marketplace alterado.');
 let parsed:unknown;
 try{parsed=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));}
 catch{throw new Error('Cursor de marketplace inválido.');}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
  throw new Error('Cursor de marketplace inválido.');
 const raw=parsed as PageState&{expiresAt?:number};
 if(raw.channel!==scope.channel||raw.kind!==scope.kind||
  raw.accountId!==scope.accountId||
  !Number.isSafeInteger(raw.expiresAt)||!raw.expiresAt||
  raw.expiresAt<now||raw.expiresAt>now+1200||
  !isState(raw,now)||raw.page<1||raw.page>10)
  throw new Error('Cursor expirado ou incompatível com a conta.');
 return {channel:raw.channel,kind:raw.kind,accountId:raw.accountId,
  offset:raw.offset,providerCursor:raw.providerCursor,
  windowTo:raw.windowTo,page:raw.page};
}
function isState(v:PageState,now:number){
 return (v.channel==='shopee'||v.channel==='mercadolivre')&&
  (v.kind==='listing'||v.kind==='order')&&
  /^[1-9][0-9]{1,20}$/.test(v.accountId)&&
  Number.isSafeInteger(v.page)&&v.page>=0&&v.page<=10&&
  Number.isSafeInteger(v.offset)&&v.offset>=0&&v.offset<=500&&
  typeof v.providerCursor==='string'&&v.providerCursor.length<=200&&
  /^[A-Za-z0-9_-]*$/.test(v.providerCursor)&&
  Number.isSafeInteger(v.windowTo)&&
  v.windowTo<=now+30&&v.windowTo>=now-1800;
}
