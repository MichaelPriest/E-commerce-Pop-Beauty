import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {encodeMarketplaceCursor,decodeMarketplaceCursor}
 from '../src/lib/marketplaces/pagination-core.ts';
const secret=randomBytes(32),now=1794400000;
const scope={channel:'shopee',kind:'order',accountId:'123456789'};
const state={...scope,offset:0,providerCursor:'Q2-AB_9',windowTo:now-3,page:1};
test('paginação assinada recupera offset, cursor e janela fixa',()=>{
 const token=encodeMarketplaceCursor(state,secret,now);
 assert.deepEqual(decodeMarketplaceCursor(token,secret,scope,now),state);
});
test('paginação rejeita alterações, conta diferente e chave diferente',()=>{
 const t=encodeMarketplaceCursor(state,secret,now);
 assert.throws(()=>decodeMarketplaceCursor(t.slice(0,-1)+'A',secret,scope,now));
 assert.throws(()=>decodeMarketplaceCursor(t,randomBytes(32),scope,now));
 assert.throws(()=>decodeMarketplaceCursor(t,secret,{...scope,accountId:'7654321'},now));
 assert.throws(()=>decodeMarketplaceCursor(t,secret,{...scope,kind:'listing'},now));
});
test('paginação expira e impede navegação ilimitada',()=>{
 const t=encodeMarketplaceCursor(state,secret,now);
 assert.throws(()=>decodeMarketplaceCursor(t,secret,scope,now+1201));
 assert.throws(()=>encodeMarketplaceCursor({...state,page:11},secret,now));
 assert.throws(()=>encodeMarketplaceCursor({...state,offset:600},secret,now));
});
