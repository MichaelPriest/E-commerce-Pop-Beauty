-- Indexar FK do responsável pela seleção de gateway (Supabase advisor).
create index if not exists idx_payment_gateway_settings_updated_by
 on public.payment_gateway_settings(updated_by)
 where updated_by is not null;