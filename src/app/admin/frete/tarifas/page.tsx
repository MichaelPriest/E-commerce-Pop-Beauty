import Link from 'next/link';
import {ArrowLeft,Truck} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import type {CheckoutDeliveryRate} from '@/lib/checkout-delivery';
import {DeliveryRatesManager} from './delivery-rates-manager';

export const dynamic='force-dynamic';
export const metadata={title:'Tarifas de entrega | Popê Beauty'};

export default async function CheckoutDeliveryRatesPage(){
 const sb=await requireAdmin();
 const {data,error}=await sb.from('checkout_delivery_rates')
  .select('id,name,cep_start,cep_end,price_cents,delivery_days,active,revision')
  .order('active',{ascending:false}).order('cep_start').order('name');

 return <div className="container admin-workspace pope-shipping-page">
  <div className="admin-top">
   <div><h1><Truck size={27}/> Tarifas de entrega</h1>
    <p>Defina opções de entrega por faixa de CEP para testar o checkout.</p>
   </div>
   <div className="pope-receipt-links">
    <Link href="/admin/frete" className="admin-outline"><ArrowLeft size={16}/> Frete e embalagem</Link>
    <Link href="/checkout" className="admin-outline">Abrir checkout</Link>
   </div>
  </div>
  {error?<p className="form-error" role="alert">Falha ao carregar as tarifas. {error.message}</p>
   :<DeliveryRatesManager rates={(data??[]) as CheckoutDeliveryRate[]}/>}
 </div>;
}
