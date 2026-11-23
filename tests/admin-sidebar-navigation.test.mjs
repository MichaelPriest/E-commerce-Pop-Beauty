import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 adminRouteMatches,activeAdminRoute,activeAdminSection,
 normalizeAdminNavigationText,searchAdminNavigation
} from '../src/lib/admin-navigation-core.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('rota específica prevalece sobre caminho pai e evita ativação duplicada',()=>{
 const targets=[
  {href:'/admin',label:'Início'},
  {href:'/admin/produtos',label:'Produtos'},
  {href:'/admin/produtos/importar',label:'Importar produtos'},
  {href:'/admin/estoque',label:'Estoque'},
  {href:'/admin/estoque/compras',label:'Compras'}
 ];
 assert.equal(activeAdminRoute('/admin/produtos/importar',targets),'/admin/produtos/importar');
 assert.equal(activeAdminRoute('/admin/estoque/compras/novo',targets),'/admin/estoque/compras');
 assert.equal(activeAdminRoute('/admin/estoque',targets),'/admin/estoque');
 assert.equal(activeAdminRoute('/admin',targets),'/admin');
 assert.equal(activeAdminRoute('/loja',targets),'');
 assert.equal(adminRouteMatches('/admin/estoqueiro','/admin/estoque'),false);
 assert.equal(adminRouteMatches('/adminx','/admin'),false);
 assert.equal(adminRouteMatches('/admin/produtos','/admin'),false);
});

test('seção ativa acompanha rota e não marca um grupo de outra área',()=>{
 const sections=[
  {id:'catalogo',items:[{href:'/admin/produtos',label:'Produtos'},
   {href:'/admin/produtos/importar',label:'Importação'}]},
  {id:'estoque',items:[{href:'/admin/estoque',label:'Estoque'},
   {href:'/admin/estoque/compras',label:'Compras'}]}
 ];
 assert.equal(activeAdminSection('/admin/produtos/importar',sections),'catalogo');
 assert.equal(activeAdminSection('/admin/estoque/compras/novo',sections),'estoque');
 assert.equal(activeAdminSection('/admin/nao-existe',sections),'');
});

test('busca rápida encontra funções ignorando acentos, capitalização e espaços',()=>{
 const targets=[
  {href:'/admin/usuarios',label:'Usuários e permissões'},
  {href:'/admin/promocoes',label:'Cupons e promoções'},
  {href:'/admin/logistica',label:'Logística'},
  {href:'/admin/estoque/recebimento',label:'Recebimento de mercadorias'}
 ];
 assert.equal(normalizeAdminNavigationText('  PRomOÇÕES   '),'promocoes');
 assert.deepEqual(searchAdminNavigation(targets,'  cupons PROMOCOES  ').map(i=>i.href),
  ['/admin/promocoes']);
 assert.deepEqual(searchAdminNavigation(targets,'usuarios permissoes').map(i=>i.href),
  ['/admin/usuarios']);
 assert.deepEqual(searchAdminNavigation(targets,'recebimento mercadorias').map(i=>i.href),
  ['/admin/estoque/recebimento']);
 assert.deepEqual(searchAdminNavigation(targets,'nao existe'),[]);
 assert.equal(searchAdminNavigation(targets,'',2).length,2);
});

test('a nova sidebar preserva todos os 33 acessos e apresenta grupos acessíveis',()=>{
 const shell=read('src/components/admin-shell.tsx');
 const nav=shell.slice(shell.indexOf(' const primaryItems:'),shell.indexOf(' const shortcuts:'));
 const hrefs=[...nav.matchAll(/href:'(\/admin(?:\/[^']*)?)'/g)].map(m=>m[1]);
 assert.equal(hrefs.length,33,'Todos os módulos administrativos devem permanecer acessíveis');
 assert.equal(new Set(hrefs).size,hrefs.length,'Não duplicar rotas na sidebar');
 for(const required of [
  '/admin','/admin/pedidos','/admin/notificacoes','/admin/atendimento','/admin/carrinhos-abandonados','/admin/feed','/admin/avaliacoes','/admin/produtos',
  '/admin/promocoes','/admin/estoque/recebimento','/admin/frete',
  '/admin/fiscal','/admin/financeiro','/admin/gateways',
  '/admin/marketplaces','/admin/prontidao','/admin/configuracoes'
 ])assert.ok(hrefs.includes(required),'Ausente: '+required);
 for(const section of [
  'Vendas e clientes','Catálogo e campanhas','Estoque e compras',
  'Logística e fiscal','Financeiro e relatórios','Equipe e sistema'
 ])assert.ok(nav.includes(section),'Seção ausente: '+section);
 assert.match(shell,/aria-expanded=\{visible\}/);
 assert.match(shell,/aria-controls=\{'pope-admin-group-'\+group.id\}/);
 assert.match(shell,/hidden=\{!visible\}/);
 assert.match(shell,/activeAdminRoute\(pathname,allItems\)/);
 assert.match(shell,/activeAdminSection\(pathname,groups\)/);
 assert.match(shell,/event.key.toLowerCase\(\)==='k'/);
 assert.match(shell,/event.key==='Escape'/);
 assert.match(shell,/pope-admin-collapsed/);
 const css=read('src/app/globals.css');
 assert.match(css,/\.pope-admin-nav-children\[hidden\]\{display:none!important\}/);
 assert.match(css,/@media\(max-width:1050px\)/);
});
