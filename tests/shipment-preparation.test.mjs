import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkShipmentPreparation} from '../src/lib/shipping/shipment-preparation.ts';

const valid=()=>({
 origin:'admin_manual',
 status:'packing',
 originPostalCode:'01001000',
 destination:{
  recipient:'Cliente Teste',phone:'11988887777',postal_code:'01310930',
  street:'Avenida Paulista',house_number:'100',complement:'Sala 12',
  district:'Bela Vista',city:'São Paulo',state_code:'SP'
 },
 plannedVolumes:2,
 volumes:[
  {volume_number:1,weight_g:700,height_cm:12,width_cm:20,length_cm:30},
  {volume_number:2,weight_g:350,height_cm:10.15,width_cm:15,length_cm:20}
 ]
});
test('conferência completa é apenas para revisão, sem emissão',()=>{
 const r=checkShipmentPreparation(valid());
 assert.equal(r.complete_for_manual_review,true);
 assert.equal(r.expected_volumes,2);
 assert.equal(r.registered_volumes,2);
 assert.equal(r.total_weight_g,1050);
 assert.deepEqual(r.issues,[]);
});
test('sem CEP de origem ou destinatário, bloqueia preparação',()=>{
 const input=valid();
 input.originPostalCode='';
 input.destination={...input.destination,postal_code:'',recipient:'',phone:''};
 const r=checkShipmentPreparation(input);
 assert.equal(r.complete_for_manual_review,false);
 assert.ok(r.issues.some(x=>x.includes('CEP de origem')));
 assert.ok(r.issues.some(x=>x.includes('CEP de destino')));
 assert.ok(r.issues.some(x=>x.includes('Telefone')));
});
test('volumes faltantes não são considerados prontos',()=>{
 const input=valid();
 input.volumes=input.volumes.slice(0,1);
 const r=checkShipmentPreparation(input);
 assert.equal(r.complete_for_manual_review,false);
 assert.ok(r.issues.some(x=>x.includes('volume 2')));
});
test('volumes excedentes e duplicados são rejeitados',()=>{
 const input=valid();
 input.volumes[1]={...input.volumes[1],volume_number:1};
 let r=checkShipmentPreparation(input);
 assert.equal(r.complete_for_manual_review,false);
 assert.ok(r.issues.some(x=>x.includes('duplicada')));
 const extra=valid();
 extra.volumes[1]={...extra.volumes[1],volume_number:3};
 r=checkShipmentPreparation(extra);
 assert.ok(r.issues.some(x=>x.includes('excedentes')));
});
test('medidas e peso irregulares geram pendências',()=>{
 const input=valid();
 input.volumes[0]={...input.volumes[0],weight_g:0,height_cm:0.001};
 const r=checkShipmentPreparation(input);
 assert.ok(r.issues.some(x=>x.includes('peso bruto inválido')));
 assert.ok(r.issues.some(x=>x.includes('dimensões inválidas')));
});
test('despacho já realizado ou pedido de outro canal não habilita revisão',()=>{
 const input=valid();
 input.status='shipped';
 input.origin='store_api';
 const r=checkShipmentPreparation(input);
 assert.equal(r.complete_for_manual_review,false);
 assert.ok(r.issues.some(x=>x.includes('antes do despacho')));
 assert.ok(r.issues.some(x=>x.includes('administrativos')));
});
test('API exige admin e não gera remessa nem etiqueta postal',()=>{
 const route=readFileSync(new URL('../src/app/api/admin/shipping/preparation/[id]/route.ts',import.meta.url),'utf8');
 assert.match(route,/getClaims\(\)/);
 assert.match(route,/profile\?\.role!=='admin'/);
 assert.match(route,/\.eq\('origin','admin_manual'\)/);
 assert.match(route,/status:409/);
 assert.match(route,/shipment_purchased:false/);
 assert.match(route,/ready_for_label_purchase:false/);
 assert.match(route,/private, no-store/);
 assert.doesNotMatch(route,/\bfetch\(/);
 assert.doesNotMatch(route,/\.update\(|\.insert\(|\.delete\(/);
});
test('endereço de entrega só pode ser salvo por admin antes do despacho',()=>{
 const sql=readFileSync(new URL('../supabase/admin_order_delivery_address_v1.sql',import.meta.url),'utf8');
 assert.match(sql,/private\.is_admin\(\)/);
 assert.match(sql,/origin='admin_manual'/);
 assert.match(sql,/status in \('paid','packing'\)/);
 assert.match(sql,/jsonb_build_object/);
 assert.match(sql,/insert into public\.order_events/);
 assert.match(sql,/revoke all on function private\.save_admin_order_delivery_address/);
});
