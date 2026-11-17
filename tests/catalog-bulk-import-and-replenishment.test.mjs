import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 CATALOG_CSV_TEMPLATE,parseCatalogCsv,parseMoneyBR,isValidGtin
} from '../src/lib/catalog-csv-core.ts';
import {
 computeReplenishment,replenishmentCsv,escapeReplenishmentCell
} from '../src/lib/stock-replenishment.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const header='acao;sku;slug;nome;categoria_slug;marca;descricao;preco;custo;ean;variacao;cor';
const newRow='criar;;batom-rosa;Batom Rosa;make;Popê Beauty;Batom cremoso;19,90;8,00;;Padrão;Rosa';
const updateRow='atualizar;SKU-101;;Batom Rosa;make;Marca;Nova descrição;22,50;9,90;7894900011517;Padrão;Rosa';

test('modelo CSV com BOM pode ser lido sem erros e com SKU automático',()=>{
 const parsed=parseCatalogCsv(CATALOG_CSV_TEMPLATE);
 assert.equal(parsed.rows.length,1);
 assert.deepEqual(parsed.errors,[]);
 assert.equal(parsed.rows[0].action,'create');
 assert.equal(parsed.rows[0].sku,'');
 assert.equal(parsed.rows[0].price_cents,1990);
});
test('CSV suporta ;, aspas duplas escapadas, quebras de linha e ponto nos preços',()=>{
 const csv=header+'\r\n'+
  'criar;;batom;Batom;make;Marca;"Rosa ""Premium""; ótima";1.299,90;500,00;;Padrão;Rosa\r\n';
 const p=parseCatalogCsv(csv);
 assert.equal(p.rows[0].description,'Rosa "Premium"; ótima');
 assert.equal(p.rows[0].price_cents,129990);
 assert.equal(parseMoneyBR('22.50'),2250);
 assert.equal(parseMoneyBR('1.000,00'),100000);
});
test('SKU de atualização é obrigatório e nome/GTIN são conferidos',()=>{
 const invalid=parseCatalogCsv(header+'\n'+
  'atualizar;;;Batom;make;Marca;Desc;10,00;4,00;;Padrão;Rosa');
 assert.ok(invalid.errors.some(s=>s.includes('SKU obrigatório')));
 assert.equal(isValidGtin('7894900011517'),true);
 assert.equal(isValidGtin('7894900011518'),false);
 assert.equal(isValidGtin('96385074'),true);
 assert.equal(isValidGtin('abc'),false);
 const parsed=parseCatalogCsv(header+'\n'+updateRow);
 assert.equal(parsed.errors.length,0);
 assert.equal(parsed.rows[0].action,'update');
});
test('CSV rejeita linhas duplicadas, delimitadores inesperados e valores malformados',()=>{
 const dup=parseCatalogCsv(header+'\n'+newRow+'\n'+newRow);
 assert.ok(dup.errors.some(s=>s.includes('slug repetido')));
 assert.throws(()=>parseCatalogCsv('nome;preco\nBatons;10'),/Colunas incompatíveis/);
 assert.throws(()=>parseCatalogCsv(header+'\n'+newRow+'\n'.repeat(45)+
  Array.from({length:42},()=>newRow).join('\n')),/entre 1 e 40/);
 assert.throws(()=>parseCatalogCsv(header+'\ncriar;"";batom;"Batom;make'),/Aspas/);
 assert.throws(()=>parseMoneyBR('-10,00'),/Preço inválido/);
 assert.throws(()=>parseMoneyBR('10000000,00'),/fora do limite/);
});
test('operação de importação é admin-only, transacional e não modifica estoque ou publicação',()=>{
 const sql=read('supabase/catalog_csv_bulk_draft_import_v1.sql');
 assert.match(sql,/auth\.uid\(\) is null or not private\.is_admin\(\)/);
 assert.match(sql,/v_count>40/);
 assert.match(sql,/p_validate_only/);
 assert.match(sql,/if not p_validate_only then/);
 assert.match(sql,/private\.is_valid_gtin\(v_ean\)/);
 assert.match(sql,/not c\.is_adult/);
 assert.match(sql,/v_sku ~ '\^POP-/);
 assert.match(sql,/0,0,'SEM-LOTE',null::date,false/);
 assert.match(sql,/update public\.products set/);
 assert.match(sql,/update public\.variants set/);
 assert.doesNotMatch(sql,/update public\.inventory|insert into public\.stock_movements|delete from public\.inventory/);
 assert.match(sql,/revoke all on function public\.bulk_upsert_catalog_csv/);
 assert.match(sql,/grant execute on function public\.bulk_upsert_catalog_csv\(jsonb,boolean\)\s+to authenticated/);
});
test('interface força validação antes de confirmar e descarta prévia após erro',()=>{
 const ui=read('src/app/admin/produtos/importar/catalog-import-manager.tsx');
 const page=read('src/app/admin/produtos/importar/page.tsx');
 const nav=read('src/components/admin-shell.tsx');
 assert.match(page,/requireAdmin\(\)/);
 assert.match(ui,/validatedPayload===payload/);
 assert.match(ui,/p_validate_only:dryRun/);
 assert.match(ui,/!verified/);
 assert.match(ui,/setValidatedPayload\(''\)/);
 assert.match(ui,/Baixar modelo CSV/);
 assert.match(nav,/href:'\/admin\/produtos\/importar'/);
});
const variant={
 id:'v',sku:'POP-0000001',ean:'7894900011517',name:'Rosa',shade:'Rosa',active:true,
 products:{id:'p',name:'Batom',brand:'Popê Beauty',active:true},
 inventory:{on_hand:10,reserved:2,safety_stock:5},
 inventory_lots:[
  {lot_code:'A',on_hand:7,expires_at:'2026-12-01'},
  {lot_code:'B',on_hand:3,expires_at:'2026-11-15'}
 ]
};
test('reposição desconta lotes vencidos e reservas, sem confundir físico e vendável',()=>{
 const rows=computeReplenishment([variant],'2026-11-16',2);
 assert.equal(rows.length,1);
 assert.equal(rows[0].physical,10);
 assert.equal(rows[0].expired,3);
 assert.equal(rows[0].validLots,7);
 assert.equal(rows[0].available,5);
 assert.equal(rows[0].minimum,5);
 assert.equal(rows[0].suggested,5);
 assert.equal(computeReplenishment([variant],'2026-11-16',1)[0].suggested,0);
});
test('lista CSV de reposição não executa fórmulas vindas de nomes maliciosos',()=>{
 const row=computeReplenishment([{...variant,products:{...variant.products,name:'=1+1'}}],
  '2026-11-16',2);
 assert.ok(escapeReplenishmentCell('=1+1').includes("'=1+1"));
 const csv=replenishmentCsv(row);
 assert.match(csv,/'=1\+1/);
 assert.match(csv,/POP-0000001/);
 assert.match(csv,/\ufeff/);
});
test('área de estoque oferece busca por EAN e link de reposição',()=>{
 const ui=read('src/app/admin/estoque/stock-manager.tsx');
 const page=read('src/app/admin/estoque/reposicao/page.tsx');
 assert.match(ui,/v\.ean/);
 assert.match(ui,/new URLSearchParams\(window\.location\.search\)/);
 assert.match(ui,/admin\/estoque\/reposicao/);
 assert.match(page,/requireAdmin\(\)/);
});
