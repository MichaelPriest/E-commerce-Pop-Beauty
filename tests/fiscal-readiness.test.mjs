import test from 'node:test';
import assert from 'node:assert/strict';
import {isCnpjValid,isCpfValid,fiscalChecklist}
 from '../src/lib/fiscal/readiness-core.ts';
const issuer={legal_name:'Empresa QA',cnpj:'11222333000181',
 state_registration:'123456789',tax_regime:3,state_code:'SP',
 city:'São Paulo',city_ibge_code:'3550308',postal_code:'01001000',
 street:'Rua Exemplo',house_number:'10',district:'Centro'};
const tax={ncm:'33041000',cest:null,tax_origin:0,commercial_unit:'UN',
 cfop_sale:'5102',icms_cst:'00',csosn:null,pis_cst:'01',cofins_cst:'01',
 cst_ibs_cbs:'000',class_trib_ibs_cbs:'000001'};
const order={issuer,recipient:{full_name:'Pessoa QA',tax_id:'52998224725'},
 lines:[{sku:'B-01',quantity:1,priceCents:1000,tax}],model:'55',
 status:'paid',shippingAddressPresent:true};
test('CPF e CNPJ por dígitos verificadores sem inferir registros reais',()=>{
 assert.equal(isCnpjValid('11222333000181'),true);
 assert.equal(isCpfValid('52998224725'),true);
 assert.equal(isCnpjValid('00000000000000'),false);
 assert.equal(isCpfValid('11111111111'),false);
});
test('detecta informações fiscais mínimas consistentes e não transmite documentos',()=>{
 assert.deepEqual(fiscalChecklist(order),[]);
});
test('bloqueia falta de endereço em NF-e e de identificação de destinatário',()=>{
 const issues=fiscalChecklist({...order,shippingAddressPresent:false,recipient:null});
 assert.ok(issues.some(x=>x.includes('Endereço de entrega')));
 assert.ok(issues.some(x=>x.includes('Destinatário identificado')));
});
test('detecta ausência de NCM, CFOP e IBS/CBS para CRT3',()=>{
 const issues=fiscalChecklist({...order,lines:[{...order.lines[0],tax:{...tax,
  ncm:null,cfop_sale:null,cst_ibs_cbs:null}}]});
 assert.ok(issues.some(x=>x.includes('NCM')));
 assert.ok(issues.some(x=>x.includes('IBS/CBS')));
});
test('NFC-e não exige destinatário CPF quando não informado, mas exige conferência do titular',()=>{
 const issues=fiscalChecklist({...order,model:'65',recipient:{full_name:'Consumidor',tax_id:null}});
 assert.equal(issues.some(x=>x.includes('CPF/CNPJ válido do destinatário para NF-e')),false);
});
