-- Popê Beauty: especificações de volumes individuais, sem contratação postal
create table if not exists public.internal_package_volumes (
 order_id uuid not null references public.orders(id) on delete cascade,
 volume_number integer not null check(volume_number between 1 and 50),
 weight_g integer not null check(weight_g between 1 and 500000),
 height_cm numeric(8,2) not null check(height_cm>0 and height_cm<=300),
 width_cm numeric(8,2) not null check(width_cm>0 and width_cm<=300),
 length_cm numeric(8,2) not null check(length_cm>0 and length_cm<=300),
 contents_note text check(contents_note is null or char_length(contents_note)<=250),
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 primary key(order_id,volume_number)
);
alter table public.internal_package_volumes enable row level security;
revoke all on public.internal_package_volumes from public,anon,authenticated;
grant select on public.internal_package_volumes to authenticated;
drop policy if exists "internal_volume_admin_read" on public.internal_package_volumes;
create policy "internal_volume_admin_read" on public.internal_package_volumes
 for select to authenticated using((select private.is_admin()));

create or replace function private.save_internal_package_volume(
 p_order_id uuid,p_number integer,p_weight integer,
 p_height numeric,p_width numeric,p_length numeric,p_note text
) returns boolean language plpgsql security definer set search_path=''
as $$
declare v_count integer;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'Somente administrador pode configurar volumes' using errcode='42501';
 end if;
 if p_order_id is null or p_number is null or p_number not between 1 and 50
  or p_weight is null or p_weight not between 1 and 500000
  or p_height is null or p_height<=0 or p_height>300
  or p_width is null or p_width<=0 or p_width>300
  or p_length is null or p_length<=0 or p_length>300
  or char_length(coalesce(p_note,''))>250 then
  raise exception 'Peso, dimensões ou número do volume inválidos';
 end if;
 perform 1 from public.orders where id=p_order_id and origin='admin_manual'
  and status in ('paid','packing') for update;
 if not found then
  raise exception 'A preparação só pode ser alterada antes do despacho';
 end if;
 select volumes into v_count from public.internal_package_preparations
  where order_id=p_order_id;
 if v_count is null then
  raise exception 'Defina a quantidade de volumes na central fiscal antes de detalhar cada volume';
 end if;
 if p_number>v_count then
  raise exception 'Número do volume maior que a quantidade prevista';
 end if;
 insert into public.internal_package_volumes
 (order_id,volume_number,weight_g,height_cm,width_cm,length_cm,contents_note,updated_by,updated_at)
 values(p_order_id,p_number,p_weight,p_height,p_width,p_length,
  nullif(btrim(p_note),''),auth.uid(),now())
 on conflict(order_id,volume_number) do update set
 weight_g=excluded.weight_g,height_cm=excluded.height_cm,
 width_cm=excluded.width_cm,length_cm=excluded.length_cm,
 contents_note=excluded.contents_note,updated_by=auth.uid(),updated_at=now();
 return true;
end;
$$;
revoke all on function private.save_internal_package_volume(uuid,integer,integer,numeric,numeric,numeric,text) from public,anon,authenticated;
grant execute on function private.save_internal_package_volume(uuid,integer,integer,numeric,numeric,numeric,text) to authenticated;
create or replace function public.save_internal_package_volume(
 p_order_id uuid,p_number integer,p_weight integer,
 p_height numeric,p_width numeric,p_length numeric,p_note text
) returns boolean language sql security invoker set search_path=''
as $$select private.save_internal_package_volume(p_order_id,p_number,p_weight,p_height,p_width,p_length,p_note)$$;
revoke all on function public.save_internal_package_volume(uuid,integer,integer,numeric,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.save_internal_package_volume(uuid,integer,integer,numeric,numeric,numeric,text) to authenticated;
comment on table public.internal_package_volumes is 'Dados físicos para preparação interna, não representam etiqueta postal nem frete contratado.';
