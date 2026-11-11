import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyMarketplaceSku} from '../src/lib/marketplaces/sku-match-core.ts';

test('SKU igual, independente da caixa e espaços, pode ser conferido',()=>{
 assert.equal(classifyMarketplaceSku('  sku-01 ',[{sku:'SKU-01',isAdult:false}]),'matched');
});
test('SKU ausente ou desconhecido não libera correspondência',()=>{
 assert.equal(classifyMarketplaceSku('',[{sku:'SKU-01',isAdult:false}]),'missing');
 assert.equal(classifyMarketplaceSku('SKU-02',[{sku:'SKU-01',isAdult:false}]),'unmatched');
});
test('produtos adultos nunca são elegíveis à associação automática',()=>{
 assert.equal(classifyMarketplaceSku('AD-01',[{sku:'AD-01',isAdult:true}]),'adult_blocked');
});
test('SKU ambíguo impede correspondência automática',()=>{
 assert.equal(classifyMarketplaceSku('SKU-01',[
  {sku:'SKU-01',isAdult:false},{sku:'sku-01',isAdult:false}
 ]),'ambiguous');
});
