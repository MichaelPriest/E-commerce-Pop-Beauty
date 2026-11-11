/** Resposta pública de conferência. Não é pedido nem autorização de pagamento. */
export type CheckoutLineStatus=
 'ready'|'unavailable'|'out_of_stock'|'variant_selection_required';
export type CheckoutPreviewLine={
 product_id:string;name:string;slug:string|null;
 quantity:number;unit_price_cents:number|null;
 line_total_cents:number|null;status:CheckoutLineStatus;
};
export type CheckoutPreview={
 currency:'BRL';ready_for_future_checkout:boolean;
 subtotal_cents:number;lines:CheckoutPreviewLine[];
 shipping_calculated:false;payment_available:false;
 stock_reserved:false;preview_only:true;checked_at:string;
};
export const checkoutStatusLabel:Record<CheckoutLineStatus,string>={
 ready:'Disponível na conferência',
 unavailable:'Produto indisponível',
 out_of_stock:'Estoque insuficiente',
 variant_selection_required:'Escolha de variação necessária'
};
