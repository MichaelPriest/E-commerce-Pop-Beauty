/** Etapas visíveis ao cliente, sem inferir autorização fiscal ou postagem. */
export const CUSTOMER_ORDER_STAGES=[
 {status:'pending',label:'Pedido registrado'},
 {status:'paid',label:'Pagamento confirmado'},
 {status:'packing',label:'Em preparação'},
 {status:'shipped',label:'Enviado'},
 {status:'delivered',label:'Entregue'}
] as const;

export function customerOrderProgress(status:string){
 if(status==='cancelled'||status==='refunded')return [];
 const index=CUSTOMER_ORDER_STAGES.findIndex(stage=>stage.status===status);
 return CUSTOMER_ORDER_STAGES.map((stage,i)=>({
  ...stage,state:i<index?'done':i===index?'current':'next'
 }));
}

function safeText(raw:unknown):string{
 return typeof raw==='string'?raw.trim().slice(0,160):'';
}

export function customerDeliveryAddress(raw:unknown):string[]{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return [];
 const address=raw as Record<string,unknown>;
 const street=[safeText(address.street),safeText(address.house_number)].filter(Boolean).join(', ');
 const city=[safeText(address.district),safeText(address.city),safeText(address.state_code)]
  .filter(Boolean).join(' · ');
 const postal=safeText(address.postal_code);
 return [safeText(address.recipient),street,safeText(address.complement),city,
  postal?'CEP '+postal:''].filter(Boolean);
}

export function customerDeliveryMethod(raw:unknown):string{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return '';
 return safeText((raw as Record<string,unknown>).name);
}
