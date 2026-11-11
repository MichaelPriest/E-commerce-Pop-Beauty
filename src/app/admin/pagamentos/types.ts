export type SandboxReservation={
 id:string;origin:string;status:string;total_cents:number;
 reservation_expires_at:string|null;created_at:string;
};
export type SandboxPaymentAttempt={
 id:string;order_id:string;provider:string;amount_cents:number;
 currency:string;environment:'sandbox';state:'draft'|'cancelled'|'expired';
 created_at:string;
};
