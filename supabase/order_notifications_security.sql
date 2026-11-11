-- As operações privilegiadas ficam no schema privado, fora da API PostgREST.
-- Publicamente há apenas wrappers SECURITY INVOKER. Cada implementação privada
-- verifica o papel admin e auth.uid() antes de acessar a fila.
alter function public.claim_order_notification(uuid,uuid) set schema private;
alter function public.finish_order_notification(uuid,uuid,boolean,text,text) set schema private;
alter function public.retry_order_notification(uuid) set schema private;

revoke all on function private.claim_order_notification(uuid,uuid) from public,anon;
revoke all on function private.finish_order_notification(uuid,uuid,boolean,text,text) from public,anon;
revoke all on function private.retry_order_notification(uuid) from public,anon;
grant execute on function private.claim_order_notification(uuid,uuid) to authenticated;
grant execute on function private.finish_order_notification(uuid,uuid,boolean,text,text) to authenticated;
grant execute on function private.retry_order_notification(uuid) to authenticated;

create or replace function public.claim_order_notification(
 p_notification_id uuid default null,p_order_id uuid default null
) returns jsonb language sql security invoker set search_path=''
as $$select private.claim_order_notification(p_notification_id,p_order_id)$$;

create or replace function public.finish_order_notification(
 p_notification_id uuid,p_claim_token uuid,p_success boolean,
 p_message_id text default null,p_error text default null
) returns boolean language sql security invoker set search_path=''
as $$select private.finish_order_notification(
 p_notification_id,p_claim_token,p_success,p_message_id,p_error
)$$;

create or replace function public.retry_order_notification(
 p_id uuid
) returns boolean language sql security invoker set search_path=''
as $$select private.retry_order_notification(p_id)$$;

revoke all on function public.claim_order_notification(uuid,uuid) from public,anon;
revoke all on function public.finish_order_notification(uuid,uuid,boolean,text,text) from public,anon;
revoke all on function public.retry_order_notification(uuid) from public,anon;
grant execute on function public.claim_order_notification(uuid,uuid) to authenticated;
grant execute on function public.finish_order_notification(uuid,uuid,boolean,text,text) to authenticated;
grant execute on function public.retry_order_notification(uuid) to authenticated;
