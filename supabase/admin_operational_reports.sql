-- Relatórios administrados usando agregações no PostgreSQL e autorização RLS do invocador.
-- Valores representam pedidos registrados; NÃO são reconciliação bancária.
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
 where private.is_admin()
   and o.created_at >= (
    (date_trunc('month',now() at time zone 'America/Sao_Paulo')
     - (greatest(1,least(coalesce(p_months,12),24))-1)*interval '1 month')
    at time zone 'America/Sao_Paulo'
   )
 group by 1 order by 1;
$$;
revoke all on function public.admin_monthly_metrics(integer) from public,anon;
grant execute on function public.admin_monthly_metrics(integer) to authenticated;

create or replace function public.admin_stock_alerts(p_limit integer default 100)
 returns table (
  product_name text,sku text,available integer,min_stock integer,
  expired_lots bigint,expiring_lots bigint
 ) language sql stable security invoker set search_path=''
as $$
 select p.name::text,v.sku::text,(i.on_hand-i.reserved)::integer,i.safety_stock,
  count(l.id) filter(where l.expires_at<current_date)::bigint,
  count(l.id) filter(where l.expires_at>=current_date and l.expires_at<=current_date+30)::bigint
 from public.inventory i
 join public.variants v on v.id=i.variant_id
 join public.products p on p.id=v.product_id
 left join public.inventory_lots l on l.variant_id=i.variant_id
  and l.on_hand>0 and l.expires_at is not null
 where private.is_admin()
 group by p.name,v.sku,i.on_hand,i.reserved,i.safety_stock
 having i.on_hand-i.reserved<=i.safety_stock
  or count(l.id) filter(where l.expires_at<=current_date+30)>0
 order by (i.on_hand-i.reserved<=i.safety_stock) desc,
  count(l.id) filter(where l.expires_at<current_date) desc,
  p.name,v.sku
 limit greatest(1,least(coalesce(p_limit,100),500));
$$;
revoke all on function public.admin_stock_alerts(integer) from public,anon;
grant execute on function public.admin_stock_alerts(integer) to authenticated;
