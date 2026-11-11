import type {Metadata} from 'next';
import {createClient} from '@/lib/supabase/server';
import {isSupabaseConfigured} from '@/lib/supabase/config';
import type {CustomerAddress} from '@/types/customer-address';
import {CheckoutPreviewPage} from './preview-page';

export const dynamic='force-dynamic';
export const metadata:Metadata={
 title:'Conferência do carrinho | Popê Beauty',
 robots:{index:false,follow:false}
};
export default async function CheckoutPage(){
 let signedIn=false,isAdmin=false;
 let addresses:CustomerAddress[]=[];
 if(isSupabaseConfigured()){
  try{
   const sb=await createClient();
   const {data:claims}=await sb.auth.getClaims();
   if(claims?.claims?.sub){
    signedIn=true;
    const [p,a]=await Promise.all([
     sb.from('profiles').select('role').eq('id',claims.claims.sub).maybeSingle(),
     sb.from('customer_addresses')
      .select('id,recipient,phone,postal_code,street,house_number,complement,district,city,state_code,is_default,created_at')
      .order('is_default',{ascending:false}).order('created_at',{ascending:false})
    ]);
    isAdmin=p.data?.role==='admin';
    addresses=(a.data??[]) as CustomerAddress[];
   }
  }catch{/* Sem autorização nesta visita. */}
 }
 return <CheckoutPreviewPage signedIn={signedIn} isAdmin={isAdmin} addresses={addresses}/>;
}
