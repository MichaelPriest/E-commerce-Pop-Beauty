import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('carrinho limita tamanho de miniaturas em desktop e dispositivos móveis',()=>{
 const css=read('src/app/globals.css');
 const marker=css.lastIndexOf('/* Carrinho: miniaturas pequenas');
 assert.ok(marker>=0,'regra de tamanho do carrinho presente');
 const bounded=css.slice(marker);
 assert.match(bounded,/\.cart-page \.pope-cart-product > \.pope-cart-thumbnail\s*\{/);
 assert.match(bounded,/width:88px/);
 assert.match(bounded,/height:88px/);
 assert.match(bounded,/max-width:88px/);
 assert.match(bounded,/flex:0 0 88px/);
 assert.match(bounded,/object-fit:contain/);
 assert.match(bounded,/@media\(max-width:680px\)/);
 assert.match(bounded,/width:64px/);
 assert.match(bounded,/height:64px/);
 assert.match(bounded,/flex:0 0 64px/);
});
test('foto possui dimensões intrínsecas e texto alternativo',()=>{
 const page=read('src/app/carrinho/page.tsx');
 assert.match(page,/<img src=\{item\.image_url\} width=\{88\} height=\{88\}/);
 assert.match(page,/loading="lazy" decoding="async"/);
 assert.match(page,/alt=\{'Foto de '/);
});
