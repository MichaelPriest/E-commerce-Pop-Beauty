-- Fortalece vínculo das provas de transporte ao pedido e reserva acesso auditado a PDF.
-- Nenhum upload, compra ou evento de transportadora é habilitado.
alter table public.shipment_workflow_requests
 add constraint shipment_workflow_id_order_unique unique(id,order_id);

alter table public.shipment_provider_documents
 add constraint shipment_doc_request_order_fkey
 foreign key(request_id,order_id)
 references public.shipment_workflow_requests(id,order_id)
 on delete cascade;

alter table public.shipment_tracking_provider_events
 add constraint shipment_tracking_request_order_fkey
 foreign key(request_id,order_id)
 references public.shipment_workflow_requests(id,order_id)
 on delete cascade;

-- Namespace canônico único evita ler PDF de outro pedido por um caminho manipulado.
alter table public.shipment_provider_documents
 add constraint shipment_document_canonical_path check(
  object_path = 'orders/'||order_id::text||'/requests/'||request_id::text||'/'||id::text||'.pdf'
 );

-- Registro do acesso a documentos oficiais do provedor, sem copiar os bytes ou a PII.
create table public.shipment_document_access_events (
 id uuid primary key default gen_random_uuid(),
 document_id uuid not null references public.shipment_provider_documents(id) on delete cascade,
 order_id uuid not null references public.orders(id) on delete cascade,
 admin_user_id uuid references auth.users(id) on delete set null,
 action text not null default 'download' check(action='download'),
 object_sha256 text not null check(object_sha256 ~ '^[a-f0-9]{64}$'),
 accessed_at timestamptz not null default now()
);
create index shipment_document_access_by_doc on public.shipment_document_access_events(document_id,accessed_at desc);
alter table public.shipment_document_access_events enable row level security;
revoke all on public.shipment_document_access_events from public,anon,authenticated;
grant select on public.shipment_document_access_events to authenticated;
create policy shipment_document_access_admin_read on public.shipment_document_access_events
 for select to authenticated using((select private.is_admin()));

comment on table public.shipment_document_access_events is
 'Auditoria de download administrativo de PDF com hash verificado. Inserção só via servidor privilegiado.';
