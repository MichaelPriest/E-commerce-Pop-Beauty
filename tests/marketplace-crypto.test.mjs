import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {shopeeSignature} from '../src/lib/marketplaces/shopee-signature-core.ts';
import {encryptOAuthSecret,decryptOAuthSecret} from '../src/lib/marketplaces/vault-core.ts';

test('assinatura pública Shopee utiliza partner_id, path, timestamp e HMAC SHA256',()=>{
 const id='2001887',path='/api/v2/shop/get_shop_info',key='shopee-test-secret';
 const timestamp=1655714431;
 const expected=createHmac('sha256',key).update(id+path+timestamp).digest('hex');
 assert.equal(shopeeSignature(id,key,path,timestamp),expected);
});
test('assinatura shop Shopee inclui token e shop_id nesta ordem',()=>{
 const id='2001887',path='/api/v2/shop/get_shop_info',key='shopee-test-secret';
 const timestamp=1655714431,token='testtoken',shop='14701711';
 const expected=createHmac('sha256',key)
  .update(id+path+timestamp+token+shop).digest('hex');
 assert.equal(shopeeSignature(id,key,path,timestamp,token,shop),expected);
 assert.notEqual(shopeeSignature(id,key,path,timestamp),expected);
});
test('assinatura Shopee rejeita parâmetros incompletos ou path externo',()=>{
 assert.throws(()=>shopeeSignature('2001887','key','https://evil.test',123));
 assert.throws(()=>shopeeSignature('2001887','key','/api/v2/shop/get_shop_info',123,'token'));
});
test('AES-256-GCM decifra token somente com chave correta',()=>{
 const key=randomBytes(32),other=randomBytes(32);
 const token='test-access-token-content';
 const encrypted=encryptOAuthSecret(token,key);
 assert.ok(encrypted.startsWith('v1.'));
 assert.notEqual(encrypted,token);
 assert.equal(decryptOAuthSecret(encrypted,key),token);
 assert.throws(()=>decryptOAuthSecret(encrypted,other));
});
test('AES-256-GCM usa IV diferente e detecta alteração do conteúdo',()=>{
 const key=randomBytes(32);
 const a=encryptOAuthSecret('refresh-token',key);
 const b=encryptOAuthSecret('refresh-token',key);
 assert.notEqual(a,b);
 const chunks=a.split('.');
 chunks[3]=Buffer.from('tampered').toString('base64url');
 assert.throws(()=>decryptOAuthSecret(chunks.join('.'),key));
});
test('AES-256-GCM exige chave 256 bits e conteúdo limitado',()=>{
 assert.throws(()=>encryptOAuthSecret('hello',randomBytes(16)));
 assert.throws(()=>encryptOAuthSecret('x'.repeat(8001),randomBytes(32)));
 assert.throws(()=>decryptOAuthSecret('invalid',randomBytes(32)));
});
