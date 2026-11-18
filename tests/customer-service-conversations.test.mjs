import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 validateServiceMessage,serviceConversationLabel,canReplyToService
} from '../src/lib/customer-service-conversation.ts';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('mensagens validam tamanho diferente para cliente e equipe',()=>{
 assert.equal(validateServiceMessage('Preciso de retorno.',false),null);
 assert.equal(validateServiceMessage('Mensagem válida para equipe.',true),null);
 assert.match(validateServiceMessage('a',false),/5 e 2000/);
 assert.match(validateServiceMessage('123456789',true),/10 e 1200/);
 assert.match(validateServiceMessage('x'.repeat(2001),false),/5 e 2000/);
 assert.match(validateServiceMessage('x'.repeat(1201),true),/10 e 1200/);
 assert.match(validateServiceMessage(null,false),/Escreva/);
 assert.equal(serviceConversationLabel('staff'),'Equipe Popê Beauty');
 assert.equal(serviceConversationLabel('customer'),'Cliente');
});

test('respostas são permitidas até o encerramento, sem desativar o checkout',()=>{
 assert.equal(canReplyToService('open'),true);
 assert.equal(canReplyToService('in_review'),true);
 assert.equal(canReplyToService('resolved'),true);
 assert.equal(canReplyToService('closed'),false);
 assert.equal(canReplyToService('unknown'),false);
});

test('migração registra autoria no banco e proíbe inserção direta de mensagens',()=>{
 const sql=read('supabase/customer_service_conversations_v1.sql');
 assert.match(sql,/create table public\.customer_service_messages/);
 assert.match(sql,/alter table public\.customer_service_messages enable row level security/);
 assert.match(sql,/revoke all on public\.customer_service_messages from public,anon,authenticated/);
 assert.match(sql,/grant select on public\.customer_service_messages to authenticated/);
 assert.doesNotMatch(sql,/grant insert .*customer_service_messages to authenticated/i);
 assert.match(sql,/customer_service_messages_owner_staff_read/);
 assert.match(sql,/r\.user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/post_service_message\(p_request_id uuid,p_body text\)/);
 assert.match(sql,/language plpgsql security definer set search_path=''/);
 assert.match(sql,/revoke all on function public\.post_service_message\(uuid,text\) from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.post_service_message\(uuid,text\) to authenticated/);
 assert.match(sql,/v_request\.user_id is distinct from v_user/);
 assert.match(sql,/v_request\.status='closed'/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/interval '1 hour'/);
 assert.match(sql,/>=12 then/);
 assert.match(sql,/case when status='resolved' then 'open' else status end/);
 assert.match(sql,/if private\.is_admin\(\) then\s+new\.reviewed_by=auth\.uid\(\)/);
 assert.doesNotMatch(sql,/alter table public\.orders|update public\.orders|update public\.payments|update public\.inventory|commercial_checkout_enabled/i);
});

test('páginas de conversa exigem autenticação, posse e perfis administrativos',()=>{
 const client=read('src/app/conta/atendimento/[id]/page.tsx');
 const admin=read('src/app/admin/atendimento/[id]/page.tsx');
 const component=read('src/components/support-conversation.tsx');
 const list=read('src/app/conta/atendimento/page.tsx');
 const adminList=read('src/app/admin/atendimento/service-manager.tsx');
 assert.match(client,/getStorefrontCustomer\(\)/);
 assert.match(client,/\.eq\('id',id\)\.eq\('user_id',customer.id\)/);
 assert.match(admin,/requireAdmin\(\)/);
 assert.match(client,/\.from\('customer_service_messages'\)/);
 assert.match(admin,/\.from\('customer_service_messages'\)/);
 assert.match(component,/\.rpc\('post_service_message'/);
 assert.match(component,/p_request_id:request.id,p_body:body.trim\(\)/);
 assert.doesNotMatch(component,/\.from\('customer_service_messages'\)\.insert/);
 assert.match(list,/\/conta\/atendimento\/\x27\+item\.id/);
 assert.match(adminList,/\/admin\/atendimento\/\x27\+r\.id/);
 assert.doesNotMatch(client+admin+component,/service_role|refundPayment|updateOrderStock|release_order_reservation|prepareMpOrderLink/);
});
