-- Otimizações da central de atendimento após auditoria do Supabase.
begin;
create index if not exists customer_service_reviewer_idx
 on public.customer_service_requests(reviewed_by)
 where reviewed_by is not null;

alter policy service_request_owner_create on public.customer_service_requests
with check (
 user_id=(select auth.uid())
 and coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false
 and (order_id is null or exists(
  select 1 from public.orders o
  where o.id=order_id and o.customer_id=(select auth.uid())
 ))
);
notify pgrst,'reload schema';
commit;
