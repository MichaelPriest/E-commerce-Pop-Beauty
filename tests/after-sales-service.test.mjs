import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 SERVICE_CATEGORIES,SERVICE_STATUSES,
 validateServiceRequest,serviceStatusLabel
} from '../src/lib/customer-service.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('atendimento valida assunto, mensagem e categoria sem mover pedidos',()=>{
 assert.equal(validateServiceRequest('devolucao','Produto errado',
  'Recebi um produto diferente do que estava descrito.'),null);
 assert.equal(validateServiceRequest('outro','Dúvida','Preciso falar sobre o meu pedido.'),null);
 assert.match(validateServiceRequest('desconto','Produto errado','Descrição longa e válida'),/motivo/);
 assert.match(validateServiceRequest('troca','abc','Descrição longa e válida'),/assunto/);
 assert.match(validateServiceRequest('troca','Assunto válido','curto'),/Descreva/);
 assert.match(validateServiceRequest('troca','Assunto válido','x'.repeat(2001)),/Descreva/);
 assert.deepEqual(Object.keys(SERVICE_CATEGORIES),['troca','devolucao','entrega','produto','outro']);
 assert.deepEqual(Object.keys(SERVICE_STATUSES),['open','in_review','resolved','closed']);
 assert.equal(serviceStatusLabel('resolved'),'Respondida');
 assert.equal(serviceStatusLabel('incorrect'),'Status desconhecido');
});

test('banco limita solicitações e permite somente ao titular vincular o próprio pedido',()=>{
 const sql=read('supabase/customer_service_requests_v1.sql');
 assert.match(sql,/alter table public\.customer_service_requests enable row level security/);
 assert.match(sql,/revoke all on public\.customer_service_requests from public,anon,authenticated/);
 assert.match(sql,/user_id=\(select auth\.uid\(\)\) or \(select private\.is_admin\(\)\)/);
 assert.match(sql,/o\.id=order_id and o\.customer_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/service_request_admin_update/);
 assert.match(sql,/grant update\(status,admin_note\) on public\.customer_service_requests to authenticated/);
 assert.match(sql,/grant insert\(user_id,order_id,category,subject,description\)/);
 assert.match(sql,/is_anonymous/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/interval '1 hour'/);
 assert.match(sql,/>=3 then/);
 assert.match(sql,/resolved_service_requires_reply/);
 assert.doesNotMatch(sql,/alter table public\.orders|grant .* to anon|set commercial_checkout_enabled/i);
});

test('cliente e administrador usam RLS e somente o cadastro de atendimentos',()=>{
 const customer=read('src/app/conta/atendimento/page.tsx');
 const form=read('src/app/conta/atendimento/service-form.tsx');
 const admin=read('src/app/admin/atendimento/page.tsx');
 const manager=read('src/app/admin/atendimento/service-manager.tsx');
 assert.match(customer,/getStorefrontCustomer\(\)/);
 assert.match(customer,/\.eq\('user_id',customer.id\)/);
 assert.match(form,/\.from\('customer_service_requests'\)/);
 assert.match(form,/\.insert\(/);
 assert.match(admin,/requireAdmin\(\)/);
 assert.match(manager,/\.update\(\{status,admin_note:note.trim\(\)\|\|null\}\)/);
 assert.match(manager,/\.eq\('updated_at',editing.updated_at\)/);
 assert.doesNotMatch(customer+form+admin+manager,/commercialPaymentStore|service_role|prepareMpOrderLink|refundPayment|claim_store_nfe/);
 const account=read('src/app/conta/page.tsx');
 assert.match(account,/href="\/conta\/atendimento"/);
 const detail=read('src/app/conta/pedidos/[id]/page.tsx');
 assert.match(detail,/conta\/atendimento\?pedido/);
 const nav=read('src/components/admin-shell.tsx');
 assert.match(nav,/href:'\/admin\/atendimento'/);
 assert.match(nav,/count:pendingSupport/);
 assert.match(read('src/app/admin/layout.tsx'),/customer_service_requests/);
});
