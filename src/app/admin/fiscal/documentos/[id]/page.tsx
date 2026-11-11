import Link from 'next/link';
import {notFound} from 'next/navigation';
import {FileText,Truck,ArrowLeft,PackageCheck,ShieldAlert} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {formatBRL} from '@/lib/products';
import {dateTimeBR} from '@/types/operations';
import {
 fiscalChecklist,type FiscalIssuer,type FiscalRecipient,type FiscalItem,
 type FiscalTax
} from '@/lib/fiscal/readiness-core';
import {PrintButton} from './print-button';

export const dynamic='force-dynamic';
type DocumentType='conferencia'|'separacao'|'etiqueta';
const modelLabels:{[key:string]:string}={'55':'NF-e 55','65':'NFC-e 65'};
function addressRows(value:unknown):{recipient:string;lines:string[]}{
 if(!value||typeof value!=='object'||Array.isArray(value))
  return {recipient:'Destinatário/endereço não informado',
   lines:['Preencher endereço antes de gerar a etiqueta postal real']};
 const data=value as Record<string,unknown>;
 const text=(v:unknown)=>typeof v==='string'?v.trim():'';
 const rua=[text(data.street),text(data.house_number)].filter(Boolean).join(', ');
 const city=[text(data.city),text(data.state_code)].filter(Boolean).join(' - ');
 return {recipient:text(data.recipient)||'Destinatário não informado',
  lines:[rua,text(data.complement),text(data.district),city,
    text(data.postal_code)].filter(Boolean)};
}
export default async function FiscalPrintDocument({
 params,searchParams
}:{params:Promise<{id:string}>;searchParams:Promise<{tipo?:string}>}){
 const {id}=await params;
 const query=await searchParams;
 const tipo:DocumentType=query.tipo==='etiqueta'?'etiqueta':
  query.tipo==='separacao'?'separacao':'conferencia';
 if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
 const sb=await requireAdmin();
 const [orders,issuerResult,draftResult,recipientResult,packageResult]=await Promise.all([
  sb.from('orders').select('id,origin,channel,status,total_cents,created_at,carrier,tracking_code,shipping_address_snapshot,order_items(id,variant_id,sku_snapshot,title_snapshot,quantity,unit_price_cents)')
   .eq('id',id).eq('origin','admin_manual').maybeSingle(),
  sb.from('fiscal_issuer_settings').select('*').eq('id',1).maybeSingle(),
  sb.from('fiscal_order_drafts').select('fiscal_model,operation_nature,review_notes').eq('order_id',id).maybeSingle(),
  sb.from('fiscal_order_recipients').select('full_name,tax_id,state_registration').eq('order_id',id).maybeSingle(),
  sb.from('internal_package_preparations').select('volumes,weight_g,packing_notes').eq('order_id',id).maybeSingle()
 ]);
 if(orders.error||!orders.data)notFound();
 const order=orders.data;
 const lines=order.order_items??[];
 const variantIds=lines.map(l=>l.variant_id).filter((v):v is string=>!!v);
 const variantRows=variantIds.length?
  await sb.from('variants').select('id,product_id').in('id',variantIds):
  {data:[],error:null};
 const productByVariant=new Map((variantRows.data??[]).map(v=>[v.id,v.product_id]));
 const productIds=[...new Set((variantRows.data??[]).map(v=>v.product_id))];
 const taxes=productIds.length?
  await sb.from('product_fiscal_details').select('*').in('product_id',productIds):
  {data:[],error:null};
 const taxByProduct=new Map((taxes.data??[]).map(t=>[t.product_id,t]));
 const fiscalLines:FiscalItem[]=lines.map(line=>({
  sku:line.sku_snapshot,quantity:line.quantity,priceCents:line.unit_price_cents,
  tax:(taxByProduct.get(productByVariant.get(line.variant_id??'')??'')??null) as FiscalTax|null
 }));
 const model=draftResult.data?.fiscal_model==='65'?'65':'55';
 const address=addressRows(order.shipping_address_snapshot);
 const issuer=issuerResult.data as FiscalIssuer|null;
 const recipient=recipientResult.data as FiscalRecipient|null;
 const checklist=fiscalChecklist({
  issuer,recipient,lines:fiscalLines,model,status:order.status,
  shippingAddressPresent:Boolean(order.shipping_address_snapshot&&
   typeof order.shipping_address_snapshot==='object'&&
   'street' in order.shipping_address_snapshot)
 });
 const volumes=packageResult.data?.volumes??1;
 const canLabel=['paid','packing','shipped','delivered'].includes(order.status);
 const totals=lines.reduce((sum,line)=>sum+line.quantity*line.unit_price_cents,0);
 return <div className={'pope-print-document document-'+tipo}>
  <div className="pope-print-actions pope-print-header">
   <Link href="/admin/fiscal" className="admin-outline"><ArrowLeft size={16}/> Central fiscal</Link>
   <PrintButton/>
  </div>
  {tipo==='conferencia'?<article className="pope-print-sheet">
   <div className="pope-print-stamp">RASCUNHO — SEM VALOR FISCAL</div>
   <h1><FileText size={25}/> Conferência pré-emissão {modelLabels[model]}</h1>
   <p className="pope-print-warning"><ShieldAlert size={17}/>
    Não é NF-e/NFC-e, DANFE, DANFE NFC-e, XML fiscal nem comprovante de autorização SEFAZ.</p>
   <div className="pope-print-section">
    <h2>Emitente (não homologado)</h2>
    <p>{issuer?.legal_name||'Razão social não cadastrada'}</p>
    <p>CNPJ: {issuer?.cnpj||'Pendente'} | IE: {issuer?.state_registration||'Pendente'} |
     Regime CRT: {issuer?.tax_regime||'Pendente'}</p>
    <p>{[issuer?.street,issuer?.house_number,issuer?.district,issuer?.city,
      issuer?.state_code,issuer?.postal_code].filter(Boolean).join(', ')||'Endereço fiscal não cadastrado'}</p>
   </div>
   <div className="pope-print-section">
    <h2>Pedido e destinatário</h2>
    <p>Pedido #{order.id} · Data: {dateTimeBR(order.created_at)} · Status: {order.status}</p>
    <p>Destinatário: {recipient?.full_name||'Pendente'} · CPF/CNPJ: {recipient?.tax_id||'Não informado'}</p>
    <p>Entrega: {address.lines.join(' · ')}</p>
    <p>Natureza informada: {draftResult.data?.operation_nature||'Não conferida'}</p>
   </div>
   <div className="pope-print-section">
    <h2>Mercadorias e códigos fiscais de referência</h2>
    <table className="pope-print-table">
     <thead><tr><th>SKU / Produto</th><th>Qtd.</th><th>Un.</th><th>Total</th>
      <th>NCM</th><th>CFOP</th><th>Origem</th></tr></thead>
     <tbody>{lines.map((line,index)=>{
      const tax=fiscalLines[index]?.tax;
      return <tr key={line.id}><td><strong>{line.sku_snapshot}</strong>
       <small>{line.title_snapshot}</small></td><td>{line.quantity}</td>
       <td>{formatBRL(line.unit_price_cents)}</td>
       <td>{formatBRL(line.unit_price_cents*line.quantity)}</td>
       <td>{tax?.ncm||'—'}</td><td>{tax?.cfop_sale||'—'}</td>
       <td>{tax?.tax_origin??'—'}</td></tr>;
     })}</tbody>
    </table>
    <p className="pope-print-total">Subtotal dos itens: {formatBRL(totals)}
      <small> · Pedido registrado: {formatBRL(order.total_cents)}</small></p>
   </div>
   <div className="pope-print-section">
    <h2>Pendências de dados para análise fiscal</h2>
    {checklist.length?<ul>{checklist.map(x=><li key={x}>{x}</li>)}</ul>:
     <p>Campos estruturais básicos presentes. Ainda é obrigatória a validação tributária,
      composição de valores, conformidade XML/XSD, certificado e autorização da SEFAZ.</p>}
   </div>
   <p className="pope-print-disclaimer">Não há chave de acesso de 44 dígitos,
    número/série fiscal autorizado, protocolo, QR Code fiscal ou assinatura digital.
    Este documento nunca deve acompanhar mercadoria como substituto de nota fiscal.</p>
  </article>:tipo==='separacao'?<article className="pope-print-sheet">
   <div className="pope-print-stamp">DOCUMENTO OPERACIONAL INTERNO</div>
   <h1><PackageCheck size={25}/> Lista de separação</h1>
   <p>Pedido #{order.id.slice(0,8).toUpperCase()} · {dateTimeBR(order.created_at)}
    · Status {order.status}</p>
   <p>Destinatário: {address.recipient} · Volumes previstos: {volumes}</p>
   <table className="pope-print-table">
    <thead><tr><th>Conferido</th><th>SKU</th><th>Produto</th><th>Qtd.</th></tr></thead>
    <tbody>{lines.map(line=><tr key={line.id}><td>☐</td>
     <td>{line.sku_snapshot}</td><td>{line.title_snapshot}</td><td>{line.quantity}</td></tr>)}</tbody>
   </table>
   <div className="pope-print-section">
    <h2>Expedição</h2><p>Transportadora: {order.carrier||'Pendente'}</p>
    <p>Rastreio: {order.tracking_code||'Pendente'}</p>
    <p>Embalagem: {packageResult.data?.packing_notes||'—'}</p>
    <p>Separado por: _____________________ Conferido por: _____________________</p>
   </div>
   <p className="pope-print-disclaimer">Uso interno: não comprova postagem ou autorização fiscal.</p>
  </article>:canLabel?<div className="pope-print-label-grid">
   {Array.from({length:Math.min(volumes,50)},(_,i)=><article className="pope-internal-label" key={i}>
    <div className="pope-print-stamp">ETIQUETA INTERNA — NÃO POSTAL</div>
    <h1>POPÊ BEAUTY</h1>
    <p><strong>PEDIDO #{order.id.slice(0,8).toUpperCase()}</strong></p>
    <p><strong>VOLUME {i+1}/{volumes}</strong></p>
    <hr/>
    <h2>{address.recipient}</h2>
    {address.lines.map((line,index)=><p key={index}>{line}</p>)}
    <hr/>
    <p>Transportadora: {order.carrier||'Não contratada'}</p>
    <p>Rastreio: {order.tracking_code||'Não informado'}</p>
    <p className="pope-print-disclaimer">Identificação interna de volume.
      Não contém autorização de transporte, selo postal ou documento fiscal.</p>
   </article>)}
  </div>:<article className="pope-print-sheet">
   <h1>Etiqueta interna indisponível</h1>
   <p>É necessário que o pedido esteja confirmado administrativamente como pago.</p>
  </article>}
 </div>;
}
