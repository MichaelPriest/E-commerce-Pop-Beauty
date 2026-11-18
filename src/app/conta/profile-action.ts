'use server';
import {refresh} from 'next/cache';
import {getStorefrontCustomer} from '@/lib/storefront-customer';
import {createClient} from '@/lib/supabase/server';

export async function updateDisplayName(_previous:{saved:boolean;message:string},form:FormData){
 const raw=form.get('display_name');
 const name=typeof raw==='string'?raw.trim().replace(/\s+/g,' '):'';
 if(name.length<2||name.length>80||name.includes('@')){
  return {saved:false,message:'Informe um nome de 2 a 80 caracteres, sem endereço de e-mail.'};
 }
 const customer=await getStorefrontCustomer();
 if(!customer)return {saved:false,message:'Entre novamente para editar o nome.'};
 const db=await createClient();
 const {data,error}=await db.from('profiles').update({display_name:name})
  .eq('id',customer.id).select('id').maybeSingle();
 if(error||!data)return {saved:false,message:'Não foi possível salvar o nome. Tente novamente.'};
 refresh();
 return {saved:true,message:'Nome atualizado.'};
}
