import {redirect} from 'next/navigation';
import Link from 'next/link';
import {MapPin,ArrowLeft,ShieldCheck} from 'lucide-react';
import {createClient} from '@/lib/supabase/server';
import {getStorefrontCustomer} from '@/lib/storefront-customer';
import type {CustomerAddress} from '@/types/customer-address';
import {AddressManager} from './address-manager';

export const dynamic='force-dynamic';
export default async function CustomerAddressesPage(){
 const customer=await getStorefrontCustomer();
 if(!customer)redirect('/entrar');
 const sb=await createClient();
 const {data,error}=await sb.from('customer_addresses')
  .select('id,recipient,phone,postal_code,street,house_number,complement,district,city,state_code,is_default,created_at')
  .eq('user_id',customer.id).is('archived_at',null)
  .order('is_default',{ascending:false}).order('created_at',{ascending:false});
 return <div className="container pope-address-page">
  <div className="section-kicker">MINHA POPÊ • ENTREGA</div>
  <div className="pope-address-heading">
   <div><h1><MapPin size={30}/> Meus endereços</h1>
    <p>Escolha o endereço principal ou cadastre um novo para suas entregas.</p></div>
   <Link href="/conta" className="admin-outline"><ArrowLeft size={17}/> Minha conta</Link>
  </div>
  {error?<p role="alert" className="form-error">Não foi possível carregar seus endereços. Tente novamente.</p>:
   <AddressManager initialAddresses={(data??[]) as CustomerAddress[]}/>}
  <p className="pope-address-privacy"><ShieldCheck size={17}/> Cada pedido guarda o endereço escolhido na compra. Alterações aqui valem para as próximas entregas.</p>
 </div>;
}
