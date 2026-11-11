import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {signedShopeeAuthorizeUrl}
 from '../src/lib/marketplaces/shopee-authorize-core.ts';

const id='2001887',key='shopee-test-only',timestamp=1794400000;
const state='AbCdef_09876543210_lmnOPQRSTUVWXYZ0123456789abcd';
const redirect='https://e-commerce-pope-beauty.vercel.app/api/admin/marketplaces/oauth/callback/shopee?state='+state;
const sign=createHmac('sha256',key)
 .update(id+'/api/v2/shop/auth_partner'+timestamp).digest('hex');

test('Shopee: gera endpoint auth_partner v2 e preserva state no redirect',()=>{
 const u=new URL(signedShopeeAuthorizeUrl({partnerId:id,redirect,timestamp,sign}));
 assert.equal(u.hostname,'partner.shopeemobile.com');
 assert.equal(u.pathname,'/api/v2/shop/auth_partner');
 assert.equal(u.searchParams.get('partner_id'),id);
 assert.equal(u.searchParams.get('timestamp'),String(timestamp));
 assert.equal(u.searchParams.get('sign'),sign);
 assert.equal(new URL(u.searchParams.get('redirect')).searchParams.get('state'),state);
 assert.equal(u.searchParams.has('auth_type'),false);
});
test('Shopee: não usa URL não assinada ou callback de terceiro',()=>{
 assert.throws(()=>signedShopeeAuthorizeUrl({
  partnerId:id,redirect:'https://evil.example/callback?state='+state,timestamp,sign}));
 assert.throws(()=>signedShopeeAuthorizeUrl({
  partnerId:id,redirect,timestamp,sign:'wrong'}));
 assert.throws(()=>signedShopeeAuthorizeUrl({
  partnerId:id,redirect:redirect.replace('https:','http:'),timestamp,sign}));
});
