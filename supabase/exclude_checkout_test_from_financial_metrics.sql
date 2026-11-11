-- Métricas comerciais excluem reservas de homologação (origin=store_api).
create or replace function public.admin_monthly_metrics(p_months integer default 12)
 returns table(
  month_key text,order_count bigint,registered_cents bigint,
  confirmed_cents bigint,pending_cents bigint,cancelled_count bigint
 ) language sql stable security invoker set search_path=''
as $$
 select to_char(date_trunc('month',o.created_at at time zone 'America/Sao_Paulo'),'YYYY-MM')::text,
   count(*)::bigint,
   coalesce(sum(o.total_cents) filter(where o.status not in ('cancelled','refunded')),0)::bigint,
   coalesce(sum(o.total_cents) filter(where o.status in ('paid','packing','shipped','delivered')),0)::bigint,
   coalesce(sum(o.total_cents) filter(where o.status='pending'),0)::bigint,
   count(*) filter(where o.status='cancelled')::bigint
 from public.orders o
 where private.is_admin() and o.origin<>'store_api'
   and o.created_at >= (
    (date_trunc('month',now() at time zone 'America/Sao_Paulo')
     - (greatest(1,least(coalesce(p_months,12),24))-1)*interval '1 month')
    at time zone 'America/Sao_Paulo'
   )
 group by 1 order by 1;
$$;
revoke all on function public.admin_monthly_metrics(integer) from public,anon;
grant execute on function public.admin_monthly_metrics(integer) to authenticated;
