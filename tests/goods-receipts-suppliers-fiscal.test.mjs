import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 validateReceiptLines,goodsReceiptPayload,parseUnitCost
} from '../src/lib/goods-receipts-core.ts';
import {
 auditFiscalCatalog,fiscalAuditCsv,csvCellSafe
} from '../src/lib/fiscal-catalog-audit.ts';
import {supplierTaxIdValid} from '../src/lib/supplier-tax-id.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const uuid='22222222-2222-4222-8222-222222222222';
const sample={
 variant_id:uuid,sku:'POP-0000001',product:'Batom Rosa',shade:'Rosa',
 lot_code:'LT-11',expires_at:'2027-12-20',quantity:'8',unit_cost:'12,50'
};
test('conferir recebimento válido e transformar custos em centavos',()=>{
 assert.deepEqual(validateReceiptLines([sample],'2026-11-16'),[]);
 const values=goodsReceiptPayload('', 'Distribuidora', 'NF 10',
  '2026-11-16','Sem avarias',[sample]);
 assert.equal(values.supplier_label,'Distribuidora');
 assert.equal(values.items[0].unit_cost_cents,1250);
 assert.equal(values.items[0].quantity,8);
 assert.equal(parseUnitCost(''),null);
 assert.equal(parseUnitCost('9.90'),990);
});
test('recusar SKU duplicado com mesmo lote, mas aceitar lotes distintos',()=>{
 const same={...sample};
 const errors=validateReceiptLines([sample,same],'2026-11-16');
 assert.ok(errors.some(x=>x.includes('repetidos')));
 assert.deepEqual(validateReceiptLines([sample,{...sample,lot_code:'LT-12'}],
  '2026-11-16'),[]);
});
test('rejeitar validade vencida e quantidade inválida na conferência',()=>{
 const errors=validateReceiptLines([
  {...sample,expires_at:'2026-11-15',quantity:'0'},
  {...sample,lot_code:'LT2',quantity:'100001'}
 ],'2026-11-16');
 assert.ok(errors.some(x=>x.includes('vencida')));
 assert.ok(errors.some(x=>x.includes('quantidade')));
 assert.throws(()=>parseUnitCost('-1,50'),/inválido/);
 assert.throws(()=>parseUnitCost('12,345'),/inválido/);
});
test('migração não altera estoque ao salvar e contabiliza uma só vez sob bloqueio',()=>{
 const sql=read('supabase/goods_receipts_supplier_register_atomic_v1.sql');
 const draft=sql.slice(sql.indexOf('create or replace function public.save_goods_receipt_draft'),
  sql.indexOf('create or replace function public.post_goods_receipt'));
 const post=sql.slice(sql.indexOf('create or replace function public.post_goods_receipt'));
 assert.doesNotMatch(draft,/perform public\.adjust_stock\(/);
 assert.match(post,/status<>'draft'/);
 assert.match(post,/where id=p_receipt_id for update/);
 assert.match(post,/perform public\.adjust_stock\(/);
 assert.match(post,/update public\.goods_receipts set status='posted'/);
 assert.match(sql,/raise exception 'Recebimento já contabilizado/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on public\.suppliers,public\.goods_receipts,public\.goods_receipt_items/);
 assert.match(sql,/grant select on public\.goods_receipts,public\.goods_receipt_items to authenticated/);
 assert.match(sql,/auth\.uid\(\) is null or not private\.is_admin\(\)/);
});
test('sistema exige confirmação e rascunho salvo antes da entrada',()=>{
 const ui=read('src/app/admin/estoque/recebimento/goods-receipt-manager.tsx');
 const page=read('src/app/admin/estoque/recebimento/page.tsx');
 assert.match(page,/requireAdmin\(\)/);
 assert.match(ui,/save_goods_receipt_draft/);
 assert.match(ui,/post_goods_receipt/);
 assert.match(ui,/window\.confirm\('CONTABILIZAR RECEBIMENTO/);
 assert.match(ui,/disabled=\{busy\|\|!saved\}/);
 assert.match(ui,/setDirty\(true\)/);
 assert.match(ui,/byBarcode\.get\(value\.toLowerCase\(\)\)/);
 assert.match(ui,/parseSupplierNfeXml\(await file\.text\(\)\)/);
 assert.match(ui,/xmlReviewed/);
});
test('validação CPF/CNPJ rejeita números e dígitos verificadores inválidos',()=>{
 assert.equal(supplierTaxIdValid('529.982.247-25'),true);
 assert.equal(supplierTaxIdValid('11.222.333/0001-81'),true);
 assert.equal(supplierTaxIdValid('52998224726'),false);
 assert.equal(supplierTaxIdValid('00000000000'),false);
 assert.equal(supplierTaxIdValid('11222333000182'),false);
});
test('fornecedores têm edição administrativa, sem exclusão de histórico',()=>{
 const sql=read('supabase/goods_receipts_supplier_register_atomic_v1.sql');
 const ui=read('src/app/admin/fornecedores/supplier-manager.tsx');
 const page=read('src/app/admin/fornecedores/page.tsx');
 assert.match(sql,/suppliers_admin_insert/);
 assert.match(sql,/suppliers_admin_update/);
 assert.match(sql,/supplier_id uuid references public\.suppliers\(id\) on delete restrict/);
 assert.match(page,/requireAdmin\(\)/);
 assert.match(ui,/\.from\('suppliers'\)\.update\(/);
 assert.match(ui,/\.from\('suppliers'\)\.insert\(/);
 assert.match(ui,/Fornecedor ativo/);
 assert.match(ui,/supplierTaxIdValid\(tax_id\)/);
});
test('XML NF-e só preenche a conferência e não autoriza nota fiscal',()=>{
 const xml=read('src/lib/supplier-nfe-preview.ts');
 assert.match(xml,/<!DOCTYPE\|<!ENTITY/);
 assert.match(xml,/new DOMParser\(\)/);
 assert.match(xml,/infNFe/);
 assert.match(xml,/cEAN/);
 assert.match(xml,/cProd/);
 assert.match(xml,/rastro/);
 assert.match(xml,/qLote/);
 assert.match(xml,/dVal/);
 assert.doesNotMatch(xml,/fetch\(|supabase\.|service_role/);
});
test('checklist fiscal respeita regime e não presume tributos automaticamente',()=>{
 const products=[{
  id:'p',name:'Batom',brand:'Popê',active:true,is_adult:false,
  product_fiscal_details:{ncm:'33041000',tax_origin:0,commercial_unit:'UN',
   cfop_sale:'5102',pis_cst:'49',cofins_cst:'49',csosn:'102'}
 }];
 const audit=auditFiscalCatalog(products,1);
 assert.equal(audit[0].readyForReview,true);
 const normal=auditFiscalCatalog(products,3);
 assert.ok(normal[0].missing.includes('CST ICMS'));
 const missing=auditFiscalCatalog([{...products[0],product_fiscal_details:null}],1);
 assert.ok(missing[0].missing.includes('NCM'));
 assert.ok(missing[0].missing.includes('CSOSN'));
 assert.match(fiscalAuditCsv(missing),/Batom/);
 assert.match(csvCellSafe('=SUM(A1:A2)'),/'=SUM/);
});
test('menu integra fornecedores/recebimento e fiscal possui exportação de pendências',()=>{
 const nav=read('src/components/admin-shell.tsx');
 const stock=read('src/app/admin/estoque/stock-manager.tsx');
 const fiscal=read('src/app/admin/fiscal/fiscal-manager.tsx');
 assert.match(nav,/href:'\/admin\/estoque\/recebimento'/);
 assert.match(nav,/href:'\/admin\/fornecedores'/);
 assert.match(stock,/href="\/admin\/estoque\/recebimento"/);
 assert.match(fiscal,/fiscalAuditCsv\(preliminaryAudit\)/);
 assert.match(fiscal,/Baixar pendências CSV/);
});

test('prontidão de lançamento inclui a operação de fornecedores e recebimentos',()=>{
 const page=read('src/app/admin/prontidao/page.tsx');
 assert.match(page,/id:'suppliers'/);
 assert.match(page,/id:'goods-receipts'/);
 assert.match(page,/admin\/estoque\/recebimento/);
});
