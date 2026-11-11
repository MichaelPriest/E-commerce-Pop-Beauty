export type OrderStatus='pending'|'paid'|'packing'|'shipped'|'delivered'|'cancelled'|'refunded';
export type CustomerRow={id:string;display_name:string;role:string;created_at:string};
export type ItemRow={id:string;sku_snapshot:string;title_snapshot:string;quantity:number;unit_price_cents:number};
export type EventRow={id:string;event_type:string;note:string;created_at:string};
export type OrderRow={
 id:string;customer_id:string|null;channel:string;origin:string;
 status:OrderStatus;total_cents:number;created_at:string;
 carrier:string|null;tracking_code:string|null;payment_reference:string|null;
 order_items:ItemRow[];order_events:EventRow[];
};
export type SellableSku={
 id:string;sku:string;name:string;shade:string|null;
 products:{name:string;price_cents:number;active:boolean;is_adult:boolean}|null;
 inventory:{on_hand:number;reserved:number}|null;
};
export type ListingRow={
 id:string;channel:'shopee'|'mercadolivre';external_listing_id:string;
 sync_status:string;last_synced_at:string|null;
 variants:{id:string;sku:string;products:{name:string;is_adult:boolean}|null}|null;
};
export const ORDER_LABELS:Record<string,string>={
 pending:'Aguardando pagamento',paid:'Pago (manual)',packing:'Em separação',
 shipped:'Enviado',delivered:'Entregue',cancelled:'Cancelado',refunded:'Reembolsado'
};
export const CHANNEL_LABELS:Record<string,string>={store:'Loja',shopee:'Shopee',mercadolivre:'Mercado Livre'};
export const dateTimeBR=(iso:string)=>new Date(iso).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'});
