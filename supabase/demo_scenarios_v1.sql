-- Popê Beauty — dados explicitamente simulados para homologação na produção.
-- Não crie contas de cliente falsas nem misture reviews/carrinhos fictícios com os reais.
begin;

create table public.demo_cart_scenarios (
  id uuid primary key,
  scenario_title text not null check (length(scenario_title) between 10 and 120),
  product_id uuid references public.products(id) on delete set null,
  quantity integer not null check (quantity between 0 and 99),
  age_minutes integer not null check (age_minutes between 0 and 43200),
  reminders_opt_in boolean not null default false,
  review_state text not null default 'new' check (review_state in ('new','reviewing','closed')),
  reviewed_at timestamptz,
  has_later_order boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.demo_cart_scenarios enable row level security;
revoke all on public.demo_cart_scenarios from public,anon,authenticated;
grant select,update(review_state) on public.demo_cart_scenarios to authenticated;
create policy demo_cart_admin_read on public.demo_cart_scenarios
  for select to authenticated using ((select private.is_admin()));
create policy demo_cart_admin_triage on public.demo_cart_scenarios
  for update to authenticated using ((select private.is_admin()))
  with check ((select private.is_admin()));
create function private.demo_cart_review_touch()
returns trigger language plpgsql set search_path=''
as $$
begin
  if new.review_state is distinct from old.review_state then
    new.reviewed_at = case when new.review_state='new' then null else clock_timestamp() end;
  end if;
  return new;
end
$$;
revoke all on function private.demo_cart_review_touch() from public,anon,authenticated;
create trigger demo_cart_review_touch
  before update of review_state on public.demo_cart_scenarios
  for each row execute function private.demo_cart_review_touch();

create table public.demo_product_review_scenarios (
  id uuid primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  author_name text not null check (author_name like 'Cliente fictício %'),
  rating smallint not null check (rating between 1 and 5),
  comment text not null check (length(btrim(comment)) between 10 and 1200),
  status text not null default 'pending' check (status in ('pending','published','hidden')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.demo_product_review_scenarios enable row level security;
revoke all on public.demo_product_review_scenarios from public,anon,authenticated;
grant select,update(status) on public.demo_product_review_scenarios to authenticated;
create policy demo_review_editor_read on public.demo_product_review_scenarios
  for select to authenticated using ((select private.is_feed_editor()));
create policy demo_review_editor_moderate on public.demo_product_review_scenarios
  for update to authenticated using ((select private.is_feed_editor()))
  with check ((select private.is_feed_editor()));
create function private.demo_review_touch()
returns trigger language plpgsql set search_path=''
as $$
begin
  new.updated_at=clock_timestamp();
  return new;
end
$$;
revoke all on function private.demo_review_touch() from public,anon,authenticated;
create trigger demo_review_touch before update of status
  on public.demo_product_review_scenarios
  for each row execute function private.demo_review_touch();

-- Demonstração de vídeo público: apenas URLs da amostra CC0 oficial da MDN.
-- Não reutilizar esta tabela para URLs arbitrárias fornecidas por usuários.
create table public.demo_feed_reels (
  id uuid primary key,
  body text not null check (body like '[DEMO POPÊ]%' and length(body) <= 800),
  video_url text not null check
    (video_url = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'),
  product_id uuid references public.products(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.demo_feed_reels enable row level security;
revoke all on public.demo_feed_reels from public,anon,authenticated;
grant select on public.demo_feed_reels to anon,authenticated;
create policy demo_reels_visible on public.demo_feed_reels
  for select to anon,authenticated using (active=true);

do $seed$
declare
  v_product uuid;
  v_category uuid;
begin
  select p.id,p.category_id into v_product,v_category
  from public.products p where p.active and not p.is_adult
  order by p.created_at desc limit 1;

  insert into public.demo_cart_scenarios
  (id,scenario_title,product_id,quantity,age_minutes,reminders_opt_in,review_state,has_later_order)
  values
  ('deca0001-0000-4000-8000-000000000001','Cenário 01 — Inativo sem autorização',v_product,2,130,false,'new',false),
  ('deca0001-0000-4000-8000-000000000002','Cenário 02 — Inativo com autorização',v_product,1,300,true,'new',false),
  ('deca0001-0000-4000-8000-000000000003','Cenário 03 — Em acompanhamento',v_product,3,1440,true,'reviewing',false),
  ('deca0001-0000-4000-8000-000000000004','Cenário 04 — Carrinho ainda ativo',v_product,1,20,false,'new',false),
  ('deca0001-0000-4000-8000-000000000005','Cenário 05 — Pedido posterior simulado',v_product,2,180,true,'new',true),
  ('deca0001-0000-4000-8000-000000000006','Cenário 06 — Acompanhamento encerrado',v_product,1,400,false,'closed',false),
  ('deca0001-0000-4000-8000-000000000007','Cenário 07 — Carrinho vazio',v_product,0,90,false,'new',false)
  on conflict (id) do nothing;

  if v_product is not null then
    insert into public.demo_product_review_scenarios
    (id,product_id,author_name,rating,comment,status)
    values
    ('dede0001-0000-4000-8000-000000000001',v_product,'Cliente fictício A',5,
     '[DEMO POPÊ] Excelente para testar 5 estrelas, comentário e aprovação.', 'pending'),
    ('dede0001-0000-4000-8000-000000000002',v_product,'Cliente fictício B',4,
     '[DEMO POPÊ] Exemplo de avaliação de 4 estrelas que aguarda análise.', 'pending'),
    ('dede0001-0000-4000-8000-000000000003',v_product,'Cliente fictício C',3,
     '[DEMO POPÊ] Nota intermediária e comentário já marcado como publicado no painel de testes.', 'published'),
    ('dede0001-0000-4000-8000-000000000004',v_product,'Cliente fictício D',2,
     '[DEMO POPÊ] Comentário simulado de 2 estrelas que permanece oculto do público.', 'hidden'),
    ('dede0001-0000-4000-8000-000000000005',v_product,'Cliente fictício E',1,
     '[DEMO POPÊ] Comentário de uma estrela para verificar a ordenação e o filtro.', 'pending')
    on conflict (id) do nothing;
  end if;

  insert into public.demo_feed_reels(id,body,video_url,product_id,category_id)
  values
  ('defe0001-0000-4000-8000-000000000001',
   '[DEMO POPÊ] VÍDEO DE AMOSTRA (CC0) — mostra flores, não um produto da loja. A associação ao catálogo é somente ilustrativa para testar o cartão clicável e a rolagem vertical.',
   'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
   v_product,v_category)
  on conflict (id) do nothing;
end
$seed$;
notify pgrst,'reload schema';
commit;
