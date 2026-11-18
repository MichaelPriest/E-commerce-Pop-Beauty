import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserList} from '../src/lib/browser-list-store.ts';
import {cartQuantity,fitsCartQuantity,normalizeCart,putCartItem} from '../src/lib/cart-core.ts';
import {normalizeFavoriteIds} from '../src/lib/favorite-ids.ts';

const id='22222222-2222-4222-8222-222222222222';
const variant='44444444-4444-4444-8444-444444444444';
const legacy={id,name:'Batom',slug:'batom',price_cents:2990,qty:2};
function browser(t){
 const target=new EventTarget(),values=new Map();
 target.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const previous=globalThis.window;
 globalThis.window=target;
 t.after(()=>{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;});
 return {target,values};
}

test('o contador soma unidades de linhas antigas e de variações, com atualização na mesma aba',t=>{
 const {values}=browser(t);
 values.set('pope-cart',JSON.stringify([legacy,{...legacy,variant_id:variant,qty:4}]));
 const cart=createBrowserList('pope-cart',normalizeCart);
 const before=cart.getSnapshot();
 assert.equal(cartQuantity(before),6);
 assert.equal(cart.getSnapshot(),before);
 const counts=[];
 const unsubscribe=cart.subscribe(()=>counts.push(cartQuantity(cart.getSnapshot())));
 cart.write(putCartItem(before,{...legacy,variant_id:variant,qty:3}));
 cart.write(cart.getSnapshot().filter(item=>!item.variant_id));
 cart.write([]);
 assert.deepEqual(counts,[9,2,0]);
 unsubscribe();
 cart.write([legacy]);
 assert.deepEqual(counts,[9,2,0]);
});

test('mudanças de outra aba e limpeza total sincronizam o carrinho e ignoram outras chaves',t=>{
 const {target,values}=browser(t);
 const cart=createBrowserList('pope-cart',normalizeCart);
 const totals=[];
 cart.subscribe(()=>totals.push(cartQuantity(cart.getSnapshot())));
 function changed(key){target.dispatchEvent(Object.assign(new Event('storage'),{key}));}
 values.set('pope-cart',JSON.stringify([legacy]));
 changed('pope-favorites');
 changed('pope-cart');
 values.set('pope-cart','{');
 changed('pope-cart');
 values.set('pope-cart',JSON.stringify([{...legacy,qty:7}]));
 changed('pope-cart');
 values.clear();changed(null);
 assert.deepEqual(totals,[2,0,7,0]);
});

test('quando o navegador bloqueia a gravação, a conferência usa o mesmo carrinho temporário',t=>{
 const {target}=browser(t);
 target.localStorage.setItem=()=>{throw new Error('quota');};
 const cart=createBrowserList('pope-cart',normalizeCart);
 cart.write([legacy]);
 assert.equal(cartQuantity(cart.getSnapshot()),2);
 assert.deepEqual(JSON.parse(cart.readRaw()),cart.getSnapshot());
});

test('favoritos preservam os IDs salvos e descartam entradas inválidas ou duplicadas',t=>{
 const {values}=browser(t);
 values.set('pope-favorites',JSON.stringify([variant,'demo-1',variant,'x',null,12,id]));
 const favorites=createBrowserList('pope-favorites',normalizeFavoriteIds);
 assert.deepEqual(favorites.getSnapshot(),[variant,'demo-1',id]);
 favorites.write(favorites.getSnapshot().filter(saved=>saved!==variant));
 assert.deepEqual(JSON.parse(values.get('pope-favorites')),['demo-1',id]);
});

test('o limite de unidades é aplicado à variação escolhida antes de confirmar a adição',()=>{
 const cart=normalizeCart([{...legacy,qty:98}]);
 assert.equal(fitsCartQuantity(cart,{...legacy,qty:1}),true);
 assert.equal(fitsCartQuantity(cart,legacy),false);
 assert.equal(fitsCartQuantity(cart,{...legacy,variant_id:variant}),true);
});
