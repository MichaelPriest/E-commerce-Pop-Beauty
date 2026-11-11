'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Truck,FlaskConical,ShieldCheck,AlertTriangle} from 'lucide-react';
import {formatBRL} from '@/lib/products';

type Line={product_id:string;quantity:number};
type ShippingQuote={
 service_id:string;carrier:string;service:string;
 price_cents:number;delivery_days:number;
};
type Props={
 postalCode:string;items:Line[];
 sandboxTokenPresent:boolean;originConfigured:boolean;
};

export function SandboxShippingQuote({
 postalCode,items,sandboxTokenPresent,originConfigured
}:Props){
 const [loading,setLoading]=useState(false);
 const [quotes,setQuotes]=useState<ShippingQuote[]>([]);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const sourceKey=postalCode+'|'+items.map(i=>i.product_id+':'+i.quantity).join(',');
 useEffect(()=>{setQuotes([]);setNotice('');setError('');},[sourceKey]);
 async function calculate(){
  if(loading||!sandboxTokenPresent||!originConfigured||
   !/^[0-9]{8}$/.test(postalCode)||items.length<1)return;
  setLoading(true);setQuotes([]);setError('');setNotice('');
  try{
   const response=await fetch('/api/admin/shipping/quote',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({postal_code:postalCode,items}),cache:'no-store'
   });
   const body=await response.json();
   if(!response.ok)throw new Error(body.error||'Não foi possível cotar o frete em sandbox.');
   if(body.sandbox!==true||!Array.isArray(body.quotes))throw new Error('Resposta da cotação inválida.');
   setQuotes(body.quotes as ShippingQuote[]);
   setNotice(body.notice||'Cotação de homologação concluída.');
  }catch(e){
   setError(e instanceof Error?e.message:'Falha na cotação de teste.');
  }finally{setLoading(false);}
 }
 return <section className="pope-shipping-checkout" aria-label="Simulação administrativa de frete">
  <div className="pope-shipping-checkout-heading">
   <Truck size={18}/><strong>Frete no sandbox — exclusivo para testes</strong>
  </div>
  <p>Consulta ao Melhor Envio sem compra de etiquetas. O valor não será incluído no pedido nem cobrado do cliente.</p>
  {!sandboxTokenPresent?<p className="pope-shipping-warning"><AlertTriangle size={16}/>
   O token de sandbox ainda não foi cadastrado na Vercel.</p>:null}
  {!originConfigured?<p className="pope-shipping-warning"><AlertTriangle size={16}/>
   Defina o CEP de postagem em <Link href="/admin/frete">Frete e embalagem</Link>.</p>:null}
  <button type="button" className="admin-outline" onClick={calculate}
   disabled={loading||!sandboxTokenPresent||!originConfigured||!postalCode||!items.length}>
   <FlaskConical size={16}/>{loading?'Consultando sandbox...':'Simular cotação para este endereço'}
  </button>
  {error?<p role="alert" className="form-error">{error}</p>:null}
  {notice?<p role="status" className="pope-shipping-info">{notice}</p>:null}
  {quotes.length?<div className="pope-shipping-quotes">
   {quotes.map(q=><div key={q.service_id}>
    <strong>{q.carrier} · {q.service}</strong>
    <span>{formatBRL(q.price_cents)} · {q.delivery_days} dia(s) no ambiente de teste</span>
   </div>)}
  </div>:null}
  <p className="pope-shipping-quote-notice"><ShieldCheck size={15}/>
   Esta simulação não garante prazo, preço ou disponibilidade para uma compra real.</p>
 </section>;
}
