import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeReadiness}
 from '../src/lib/release-readiness.ts';

const item=(id,state)=>({id,group:'Técnico',title:id,detail:id,state});
test('contabiliza os bloqueadores sem autorizar abertura comercial',()=>{
 const result=summarizeReadiness([
  item('checkout','blocked'),item('frete','blocked'),
  item('produtos','ready'),item('email','pending'),item('fiscal','manual')
 ]);
 assert.deepEqual(result,{
  ready:1,pending:1,blocked:2,manual:1,
  total:5,canOpen:false,needsAction:4
 });
});
test('sem bloqueadores explícitos, a abertura comercial permanece bloqueada',()=>{
 const result=summarizeReadiness([item('checkout','ready')]);
 assert.equal(result.canOpen,false);
 assert.equal(result.needsAction,0);
});
test('lista vazia não é autorização de produção',()=>{
 const result=summarizeReadiness([]);
 assert.equal(result.canOpen,false);
 assert.equal(result.total,0);
});
