-- Use literal dot class to avoid ambiguous escaping in Postgres regex.
alter table public.shipment_provider_documents
 drop constraint shipment_provider_documents_object_path_check;
alter table public.shipment_provider_documents
 add constraint shipment_provider_documents_object_path_check
 check (object_path ~ '^[a-zA-Z0-9/_-]{5,240}[.]pdf$'
    and position('..' in object_path)=0);
