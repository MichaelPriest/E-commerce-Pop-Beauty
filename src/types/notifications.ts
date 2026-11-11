export type NotificationStatus='pending'|'sending'|'sent'|'failed';
export type NotificationRow={
 id:string;order_id:string;recipient_email:string;recipient_name:string;
 event_type:'created'|'payment_confirmed'|'shipped'|'delivered'|'cancelled';
 status:NotificationStatus;attempts:number;created_at:string;sent_at:string|null;
 last_attempt_at:string|null;error_message:string|null;
};
export const NOTIFICATION_LABELS:Record<string,string>={
 created:'Pedido recebido',payment_confirmed:'Pagamento confirmado',
 shipped:'Pedido enviado',delivered:'Pedido entregue',cancelled:'Pedido cancelado'
};
