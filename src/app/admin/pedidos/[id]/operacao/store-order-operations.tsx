'use client';

import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useState} from 'react';
import {createClient} from '@/lib/supabase/browser';
import {formatBRL} from '@/lib/products';

type Quote={id:number;name:string;carrier:string;costCents:number};
type Props={
 order:{id:string;status:string;shipped_at:string|null};
 cancellation:{state:string;reason:string}|null;
 payments:{payment_id:string;status:string;amount_cents:number;confirmed_at:string|null}[];
 refunds:{payment_id:string;state:string}[];
 canRefund:boolean;
 nfe:{status:string;invoice_key:string|null;provider_message:string|null}|null;
 fiscalEnvironment:'homologacao'|'producao'|null;
 label:{id:string;status:string;provider_id:string|null;cost_cents:number|null;max_cost_cents:number;carrier:string|null;tracking_code:string|null}|null;
 shippingEnvironment:'sandbox'|'producao'|null;
};

const fiscalStatus:Record<string,string>={submitting:'Aguardando confirmação de envio',processing:'Em processamento',authorized:'Autorizada',
 rejected:'Recusada',cancelling:'Cancelamento solicitado',cancelled:'Cancelada'};
const shippingStatus:Record<string,string>={cart_creating:'Aguardando ID do Melhor Envio',cart_ready:'No carrinho',buying:'Compra em confirmação',
 paid:'Comprada',generating:'Geração em confirmação',generated:'Gerada',cancelling:'Cancelamento solicitado',cancelled:'Cancelada',posted:'Postada',delivered:'Entregue'};

export function StoreOrderOperations({order,cancellation,payments,refunds,canRefund,nfe,fiscalEnvironment,label,shippingEnvironment}:Props){
 const router=useRouter();
 const [reason,setReason]=useState(cancellation?.reason??'');
 const [paymentId,setPaymentId]=useState(payments.find(p=>p.confirmed_at)?.payment_id??'');
 const [fiscalJson,setFiscalJson]=useState(''),[fiscalReason,setFiscalReason]=useState('');
 const [quotes,setQuotes]=useState<Quote[]>([]),[serviceId,setServiceId]=useState(''),[agency,setAgency]=useState('');
 const [providerId,setProviderId]=useState(''),[printLink,setPrintLink]=useState(''),[shipReason,setShipReason]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const paid=['paid','packing'].includes(order.status);
 const canRequest=!['cancelled','refunded'].includes(order.status);
 const cancellationOpen=cancellation?.state==='requested';
 const nfeUrl='/api/admin/fiscal/nfe/'+order.id;
 const labelUrl='/api/admin/shipping/label/'+order.id;
 const selected=quotes.find(q=>q.id===Number(serviceId));
 const printable=Boolean(label&&['generated','posted','delivered'].includes(label.status));
 const note=reason.trim().length>=3;

 async function post(path:string,body:object){
  const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result=await res.json();
  if(!res.ok)throw new Error(result.error??'Operação indisponível.');
  return result;
 }

 async function run(fn:()=>Promise<string|void>){
  if(busy)return;
  setBusy(true);setMessage('');setError('');
  try{setMessage(await fn()||'');}catch(e){setError(e instanceof Error?e.message:'Operação indisponível.');}
  finally{setBusy(false);router.refresh();}
 }
 const fiscalAction=(action:string,other:object={})=>run(async()=>{
  const result=await post(nfeUrl,{action,...other});
  if(result.payload)setFiscalJson(JSON.stringify(result.payload,null,2));
  return result.message;
 });
 const shippingAction=(action:string,other:object={})=>run(async()=>{
  const result=await post(labelUrl,{action,...other});
  if(result.quotes){setQuotes(result.quotes);setServiceId(String(result.quotes[0]?.id??''));}
  if(result.url)setPrintLink(result.url);
  return result.message??(result.quotes?.length===0?'Nenhum serviço compatível com os volumes.':'');
 });
 const refundAction=(action:'refund'|'refund_status')=>run(async()=>{
  const result=await post('/api/admin/payments/mercadopago/order',{
   action,order_id:order.id,payment_id:paymentId.trim(),reason:reason.trim(),
  });
  return result.message;
 });
 const cancelOrder=(dismiss=false)=>run(async()=>{
  const {data,error}=await createClient().rpc(dismiss?'dismiss_store_order_cancel':'request_store_order_cancel',{
   p_order_id:order.id,...(dismiss?{}:{p_reason:reason.trim()}),
  });
  if(error)throw new Error(error.message);
  return dismiss?'Solicitação encerrada.':data==='completed'?'Reserva encerrada.':'Cancelamento solicitado.';
 });

 return <>
  {error&&<p className="form-error" role="alert">{error}</p>}
  {message&&<p className="form-success" role="status">{message}</p>}
  <section className="ops-form-card" id="cancelamento"><h2>Cancelamento e estorno</h2>
   {cancellation&&<p>{cancellationOpen?'Cancelamento solicitado':cancellation.state==='completed'?'Cancelamento concluído':'Solicitação encerrada'} · {cancellation.reason}</p>}
   {refunds.map(r=><p key={r.payment_id}>Pagamento #{r.payment_id} · {r.state==='confirmed'?'Estorno confirmado':'Estorno em conferência'}</p>)}
   {order.shipped_at&&<p>Para pedidos postados, registre a devolução física no estoque após receber e conferir os produtos.</p>}
   <div className="admin-form">
    {(canRequest||canRefund)&&<label>Motivo<input value={reason} maxLength={500} onChange={e=>setReason(e.target.value)}/></label>}
    {canRefund?<label>ID do pagamento no Mercado Pago<input inputMode="numeric" list={'pagamentos-'+order.id} maxLength={24}
     value={paymentId} onChange={e=>setPaymentId(e.target.value.replace(/\D/g,''))}/>
     <datalist id={'pagamentos-'+order.id}>{payments.map(p=><option key={p.payment_id} value={p.payment_id}>{formatBRL(p.amount_cents)} · {p.status}</option>)}</datalist>
    </label>:<p className="admin-help">Estorno pelo Mercado Pago aguarda configuração da conta vendedora.</p>}
    <div className="ops-buttons">
     {canRequest&&<button className="admin-outline" disabled={busy||!note} onClick={()=>void cancelOrder()}>
      {cancellationOpen?'Reavaliar cancelamento':'Solicitar cancelamento'}</button>}
     {cancellationOpen&&<button className="admin-outline" disabled={busy} onClick={()=>void cancelOrder(true)}>Encerrar solicitação</button>}
     {canRefund&&<>
      <button className="admin-primary" disabled={busy||!note||!paymentId} onClick={()=>void refundAction('refund')}>Solicitar estorno total</button>
      <button className="admin-outline" disabled={busy||!note||!paymentId} onClick={()=>void refundAction('refund_status')}>Consultar estorno</button>
     </>}
    </div>
   </div>
  </section>

  <section className="ops-form-card" id="nfe"><h2>NF-e de venda</h2>
   <p>{fiscalEnvironment==='producao'?'Focus NFe · Produção':fiscalEnvironment==='homologacao'?'Focus NFe · Homologação':'Focus NFe aguarda credenciais.'}</p>
   {nfe&&<p><strong>{fiscalStatus[nfe.status]??nfe.status}</strong>{nfe.invoice_key?' · '+nfe.invoice_key:''}</p>}
   {nfe?.provider_message&&<p>{nfe.provider_message}</p>}
   <div className="ops-buttons">
    {paid&&(!nfe||nfe.status==='rejected')&&<button className="admin-outline" disabled={busy} onClick={()=>void fiscalAction('draft')}>Carregar dados fiscais</button>}
    {nfe&&fiscalEnvironment&&<button className="admin-outline" disabled={busy} onClick={()=>void fiscalAction('status')}>Consultar NF-e</button>}
    {nfe?.status==='submitting'&&paid&&!cancellationOpen&&fiscalEnvironment&&<button className="admin-outline" disabled={busy}
     onClick={()=>void fiscalAction('retry')}>Reprocessar a mesma referência</button>}
    <Link className="admin-outline" href={'/admin/fiscal?pedido='+order.id}>Cadastro fiscal</Link>
    {nfe&&['authorized','cancelled'].includes(nfe.status)&&fiscalEnvironment&&<>
     <a className="admin-outline" href={nfeUrl+'?document=xml'}>Baixar XML</a>
     <a className="admin-outline" href={nfeUrl+'?document=danfe'}>Baixar DANFE</a>
     {nfe.status==='cancelled'&&<a className="admin-outline" href={nfeUrl+'?document=cancelamento'}>XML do cancelamento</a>}
    </>}
   </div>
   {fiscalJson&&paid&&(!nfe||nfe.status==='rejected')&&<div className="admin-form">
    <label>Dados para emissão<textarea spellCheck={false} rows={15} value={fiscalJson} onChange={e=>setFiscalJson(e.target.value)}/></label>
    <p className="admin-help">Use os dados validados pela contabilidade. Confira tributos, frete e os meios de pagamento.</p>
    <div><button className="admin-primary" disabled={busy||!fiscalEnvironment||cancellationOpen} onClick={()=>void run(async()=>{
     let payload;
     try{payload=JSON.parse(fiscalJson);}catch{throw new Error('Confira o formato dos dados fiscais.');}
     return (await post(nfeUrl,{action:'submit',payload})).message;
    })}>Transmitir NF-e</button></div>
   </div>}
   {nfe?.status==='authorized'&&!order.shipped_at&&(cancellationOpen||['refunded','cancelled'].includes(order.status))&&<div className="admin-form">
    <label>Justificativa fiscal<input value={fiscalReason} maxLength={255} onChange={e=>setFiscalReason(e.target.value)}/></label>
    <div><button className="admin-outline" disabled={busy||!fiscalEnvironment||fiscalReason.trim().length<15}
      onClick={()=>void fiscalAction('cancel',{reason:fiscalReason})}>Cancelar NF-e</button></div>
   </div>}
  </section>

  <section className="ops-form-card" id="etiqueta"><h2>Frete e etiqueta</h2>
   <p>{shippingEnvironment==='producao'?'Melhor Envio · Produção':shippingEnvironment==='sandbox'?'Melhor Envio · Sandbox':'Melhor Envio aguarda credenciais.'}</p>
   {label&&<div><p><strong>{shippingStatus[label.status]??label.status}</strong>
    {label.carrier?' · '+label.carrier:''}{label.cost_cents!==null?' · '+formatBRL(label.cost_cents):''}</p>
    {label.tracking_code&&<p>Rastreio {label.tracking_code}</p>}
    <p className="admin-help">Referência {label.id}{label.provider_id?' · Envio '+label.provider_id:''}</p></div>}
   <div className="ops-buttons">
    <Link className="admin-outline" href={'/admin/logistica/volumes/'+order.id}>Conferir volumes</Link>
    {paid&&!cancellationOpen&&(!label||label.status==='cancelled')&&<button className="admin-outline" disabled={busy||!shippingEnvironment}
     onClick={()=>void shippingAction('quote')}>Cotar serviços</button>}
    {label?.provider_id&&<button className="admin-outline" disabled={busy||!shippingEnvironment} onClick={()=>void shippingAction('status')}>Atualizar situação</button>}
    {label?.status==='cart_ready'&&label.cost_cents!==null&&paid&&!cancellationOpen&&<button className="admin-primary"
     disabled={busy||!shippingEnvironment||label.cost_cents>label.max_cost_cents} onClick={()=>void shippingAction('buy')}>Comprar por até {formatBRL(label.max_cost_cents)}</button>}
    {label?.status==='paid'&&paid&&!cancellationOpen&&<button className="admin-primary" disabled={busy||!shippingEnvironment}
     onClick={()=>void shippingAction('generate')}>Gerar etiqueta</button>}
    {printable&&shippingEnvironment&&<><a className="admin-outline" href={labelUrl}>Baixar etiqueta PDF</a>
     <button className="admin-outline" disabled={busy} onClick={()=>void shippingAction('print')}>Preparar link de impressão</button></>}
    {printLink&&printable&&<a className="admin-outline" href={printLink} target="_blank" rel="noreferrer noopener">Abrir no Melhor Envio</a>}
    {shippingEnvironment==='producao'&&label&&['posted','delivered'].includes(label.status)&&!cancellationOpen&&
     ['packing','shipped'].includes(order.status)&&<button className="admin-primary" disabled={busy}
     onClick={()=>void shippingAction('dispatch')}>{order.status==='packing'?'Registrar postagem':'Registrar entrega'}</button>}
   </div>
   {quotes.length>0&&(!label||label.status==='cancelled')&&<div className="admin-form">
    <label>Serviço<select value={serviceId} onChange={e=>setServiceId(e.target.value)}>
     {quotes.map(q=><option key={q.id} value={q.id}>{q.carrier} · {q.name} · {formatBRL(q.costCents)}</option>)}</select></label>
    <label>ID da agência, quando exigido<input inputMode="numeric" maxLength={9} value={agency} onChange={e=>setAgency(e.target.value.replace(/\D/g,''))}/></label>
    <div><button className="admin-primary" disabled={busy||!selected||cancellationOpen} onClick={()=>{
     if(selected)void shippingAction('cart',{service_id:selected.id,max_cost_cents:selected.costCents,agency_id:agency?Number(agency):null});
    }}>Adicionar envio ao carrinho</button></div>
   </div>}
   {label?.status==='cart_creating'&&<div className="admin-form">
    <label>ID do envio encontrado no Melhor Envio<input value={providerId} maxLength={36} onChange={e=>setProviderId(e.target.value)}/></label>
    <div><button className="admin-outline" disabled={busy||providerId.trim().length!==36} onClick={()=>void shippingAction('recover',{provider_id:providerId.trim()})}>Recuperar envio</button></div>
   </div>}
   {label&&['cart_ready','paid','generated'].includes(label.status)&&<div className="admin-form">
    <label>Motivo do cancelamento da etiqueta<input value={shipReason} maxLength={255} onChange={e=>setShipReason(e.target.value)}/></label>
    <div><button className="admin-outline" disabled={busy||shipReason.trim().length<3}
     onClick={()=>void shippingAction('cancel',{reason:shipReason})}>Cancelar etiqueta</button></div>
   </div>}
  </section>
 </>;
}
