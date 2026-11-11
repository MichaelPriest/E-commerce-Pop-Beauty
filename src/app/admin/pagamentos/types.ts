export type SandboxReservation={
 id:string;origin:string;status:string;total_cents:number;
 reservation_expires_at:string|null;created_at:string;
 checkout_generation_state:'not_started'|'preparing'|'ready';
 provider_checkout_url:string|null;
};
export type SandboxPaymentAttempt={
 id:string;order_id:string;provider:string;amount_cents:number;
 currency:string;environment:'sandbox';state:'draft'|'cancelled'|'expired';
 created_at:string;
};
