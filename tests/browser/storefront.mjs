import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {existsSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)('playwright');
const {expect}=createRequire(import.meta.url)('playwright/test');
const root='http://127.0.0.1:4390';
const fixtureUrl='http://127.0.0.1:4391';
const one='22222222-2222-4222-8222-222222222222',absent='44444444-4444-4444-8444-444444444444';
const fixture=spawn(process.execPath,['tests/browser/fixture.mjs'],{stdio:'inherit'});
const next=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','4390'],{
 stdio:'inherit',env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:fixtureUrl,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'fixture-publishable'}
});
let browser;
const problems=[];
const make=async(width,height,isMobile=false)=>{
 const c=await browser.newContext({viewport:{width,height},isMobile,hasTouch:isMobile});c.setDefaultTimeout(11000);
 await c.route('https://**/*',route=>route.abort());
 c.on('page',p=>p.on('pageerror',err=>problems.push(err.message)));
 return c;
};
function count(p,n){return expect(p.locator('.header-actions a[href="/carrinho"]')).toHaveAccessibleName('Carrinho, '+n+(n===1?' item':' itens'));}
const go=(p,path)=>p.goto(root+path,{waitUntil:'domcontentloaded'});
async function layout(p){
 const dimensions=await p.evaluate(()=>({
  width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,
  actions:[...document.querySelectorAll('.header-actions a')].map(x=>{const r=x.getBoundingClientRect();return [r.left,r.right,r.width,r.height];}),
  name:getComputedStyle(document.querySelector('.header-account small')).display
 }));
 assert.equal(dimensions.width,p.viewportSize().width);
 assert.ok(dimensions.scroll<=dimensions.width+1,JSON.stringify(dimensions));assert.notEqual(dimensions.name,'none');
 for(const [left,right,w,h] of dimensions.actions){assert.ok(left>=0&&right<=dimensions.width+1&&w>=40&&h>=40,JSON.stringify(dimensions));}
}
async function login(p,email){
 await p.locator('input[type=email]').fill(email);
 await p.locator('input[type=password]').fill('fixture-password');
 await p.getByRole('button',{name:'Entrar na minha conta'}).click();
 await p.waitForURL('**/conta',{timeout:12000});
}
try{
 for(let i=0;i<60;i++){
  try{if((await fetch(root+'/carrinho')).ok)break;}catch{}
  await pause(500);
 }
 const executablePath=process.env.CHROME_BIN||(existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':'/usr/bin/chromium');
 browser=await chromium.launch({executablePath,headless:true,args:['--disable-dev-shm-usage']});
 const c=await make(1365,900),p=await c.newPage();
 await go(p,'/');
 await expect(p.locator('.header-account')).toHaveAccessibleName('Entrar na minha conta');await count(p,0);await layout(p);
 const card=p.locator('article.product-card').filter({hasText:'Batom Rosa'});
 await card.getByRole('button',{name:'Adicionar aos favoritos'}).click();
 await expect(card.getByRole('button',{name:'Remover dos favoritos'})).toHaveAttribute('aria-pressed','true');
 await card.getByRole('button',{name:'Adicionar ao carrinho'}).click();await count(p,1);
 await p.locator('.header-actions a[href="/favoritos"]').click();
 await expect(p.getByRole('heading',{name:'Meus favoritos'})).toBeVisible();
 await expect(p.locator('.product-name')).toHaveText('Batom Rosa');
 await p.locator('.product-name').click();
 await p.getByRole('combobox',{name:'Quantidade'}).selectOption('3');
 await p.getByRole('button',{name:'Adicionar ao carrinho'}).click();await count(p,4);
 await p.locator('.header-actions a[href="/carrinho"]').click();
 await expect(p.locator('.quantity b')).toHaveText('4');
 const sibling=await c.newPage();await go(sibling,'/carrinho');await count(sibling,4);
 await p.getByRole('button',{name:'Aumentar quantidade de Batom Rosa'}).click();await count(p,5);await count(sibling,5);
 await sibling.getByRole('button',{name:'Diminuir quantidade de Batom Rosa'}).click();await count(p,4);
 await p.reload({waitUntil:'domcontentloaded'});await count(p,4);
 await p.getByRole('button',{name:'Remover Batom Rosa do carrinho'}).click();await count(sibling,0);
 await expect(p.getByRole('heading',{name:/carrinho está vazio/})).toBeVisible();
 console.log('Desktop cart add by card and variant, quantity, reload, second tab and removal passed.');
 await go(p,'/favoritos');await expect(p.locator('.product-name')).toHaveText('Batom Rosa');
 await p.getByRole('button',{name:'Remover dos favoritos'}).click();
 await expect(p.getByRole('heading',{name:'Quais produtos você quer guardar?'})).toBeVisible();
 const lookup=await c.request.get(root+'/api/catalogo/favoritos?ids='+one+','+absent);
 assert.equal(lookup.status(),200);assert.deepEqual((await lookup.json()).products.map(x=>x.id),[one]);
 assert.equal((await c.request.get(root+'/api/catalogo/favoritos?ids=bad')).status(),400);
 console.log('Public favorites, remove, missing product and invalid lookup passed.');
 await go(p,'/conta');await p.waitForURL('**/entrar');await login(p,'ana@loja.example');
 await expect(p.locator('.header-account')).toHaveText('Olá, Ana');
 await expect(p.getByText('Olá, Ana Costa!')).toBeVisible();
 await expect(sibling.locator('.header-account')).toHaveText('Olá, Ana');
 await expect(p.getByText('ana@loja.example')).toBeVisible();
 await expect(p.locator('.customer-order')).toHaveCount(10);
 await expect(p.getByText('BR1234TEST')).toBeVisible();
 await expect(p.getByRole('button',{name:'Cancelar teste'})).toBeVisible();
 await p.getByRole('link',{name:'Mais antigos'}).click();
 await expect(p.getByText('Página 2',{exact:true})).toBeVisible();await expect(p.locator('.customer-order')).toHaveCount(10);
 await p.getByRole('link',{name:'Mais antigos'}).click();await expect(p.locator('.customer-order')).toHaveCount(2);
 await expect(p.getByRole('link',{name:'Mais antigos'})).toHaveCount(0);
 await p.getByRole('link',{name:'Mais recentes'}).click();await expect(p.getByText('Página 2',{exact:true})).toBeVisible();
 await p.getByText('Editar nome',{exact:true}).click();
 await p.getByLabel('Nome de exibição').fill('Anabela Costa');
 await p.getByRole('button',{name:'Salvar nome'}).click();
 await expect(p.getByText('Nome atualizado.',{exact:true})).toBeVisible();
 await expect(p.locator('.header-account')).toHaveText('Olá, Anabela');
 await expect(p.getByText('Olá, Anabela Costa!')).toBeVisible();
 await p.getByRole('link',{name:/Meus endereços Entregas/}).click();
 await expect(p.getByRole('heading',{name:'Meus endereços'})).toBeVisible();
 await expect(p.getByRole('heading',{name:'Você ainda não tem endereços'})).toBeVisible();
 await expect(p.getByRole('button',{name:'Novo endereço'})).toBeEnabled();await p.locator('.header-account').click();
 await p.getByRole('button',{name:'Sair da conta'}).click();await p.waitForURL('**/entrar');
 await expect(p.locator('.header-account')).toHaveText('Entrar');
 await sibling.bringToFront();await sibling.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(sibling.locator('.header-account')).toHaveText('Entrar');
 await go(p,'/conta');await p.waitForURL('**/entrar');
 console.log('Authenticated navigation, 22 orders, tracking, address, profile edit and sign out passed.');
 await c.close();
 const m=await make(360,800,true),mobile=await m.newPage();
 await go(mobile,'/');await layout(mobile);
 await mobile.getByRole('button',{name:'Abrir menu'}).click();await expect(mobile.getByRole('button',{name:'Fechar menu'})).toHaveAttribute('aria-expanded','true');
 await mobile.getByRole('button',{name:'Fechar menu'}).click();
 await mobile.locator('article.product-card').first().getByRole('button',{name:'Adicionar ao carrinho'}).click();
 await count(mobile,1);await mobile.locator('.header-account').click();await login(mobile,'bia@loja.example');
 await expect(mobile.locator('.header-account')).toHaveText('Olá, bia');
 await expect(mobile.getByRole('heading',{name:'Você ainda não tem pedidos'})).toBeVisible();
 await expect(mobile.getByText('BR1234TEST')).toHaveCount(0);
 await layout(mobile);await count(mobile,1);
 await mobile.setViewportSize({width:320,height:700});await layout(mobile);
 await mobile.locator('.header-actions a[href="/carrinho"]').click();await count(mobile,1);await layout(mobile);
 await mobile.getByRole('button',{name:'Diminuir quantidade de Batom Rosa'}).click();await count(mobile,0);
 console.log('360/320 mobile account, isolation, guest/auth label, menu and cart passed.');
 assert.deepEqual(problems,[]);
}finally{
 await browser?.close();
 next.kill('SIGTERM');
 fixture.kill('SIGTERM');
}
