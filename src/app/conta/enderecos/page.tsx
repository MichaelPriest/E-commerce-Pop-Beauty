import {redirect} from 'next/navigation';
import Link from 'next/link';
import {MapPin,ArrowLeft,ShieldCheck} from 'lucide-react';
import {createClient} from '@/lib/supabase/server';
import {isSupabaseConfigured} from '@/lib/supabase/config';
import type {CustomerAddress} from '@/types/customer-address';
import {AddressManager} from './address-manager';

export const dynamic='force-dynamic';
export default async function CustomerAddressesPage(){
 if(!isSupabaseConfigured())redirect('/entrar');
 const sb=await createClient();
 const {data:claims}=await sb.auth.getClaims();
 if(!claims?.claims?.sub)redirect('/entrar');
 const {data,error}=await sb.from('customer_addresses')
  .select('id,recipient,phone,postal_code,street,house_number,complement,district,city,state_code,is_default,created_at')
  .order('is_default',{ascending:false}).order('created_at',{ascending:false});
 return <div className="container pope-address-page">
  <div className="section-kicker">MINHA POPÊ • ENTREGA</div>
  <div className="pope-address-heading">
   <div><h1><MapPin size={30}/> Meus endereços</h1>
    <p>Salve seus endereços para preparar futuras compras com mais praticidade.</p></div>
   <Link href="/conta" className="admin-outline"><ArrowLeft size={17}/> Minha conta</Link>
  </div>
  {error?<p role="alert" className="form-error">Não foi possível carregar seus endereços: {error.message}</p>:
   <AddressManager initialAddresses={(data??[]) as CustomerAddress[]}/>}
  <p className="pope-address-privacy"><ShieldCheck size={17}/> Seus dados são visíveis apenas para você nesta área. No pedido, o endereço é copiado para o registro da entrega. Nenhuma encomenda será enviada enquanto a loja não habilitar o checkout.</p>
 </div>;
}
