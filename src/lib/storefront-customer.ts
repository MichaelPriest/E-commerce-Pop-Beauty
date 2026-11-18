import {cache} from 'react';
import {createClient} from '@/lib/supabase/server';
import {isSupabaseConfigured} from '@/lib/supabase/config';

export const getStorefrontCustomer=cache(async()=>{
 if(!isSupabaseConfigured())return null;
 const db=await createClient();
 const {data}=await db.auth.getClaims();
 const claims=data?.claims;
 if(!claims?.sub||claims.is_anonymous===true)return null;
 const {data:profile}=await db.from('profiles').select('display_name,role')
  .eq('id',claims.sub).maybeSingle();
 const name=[profile?.display_name,claims.user_metadata?.full_name]
  .find(value=>typeof value==='string'&&value.trim()&&!value.includes('@'));
 return {
  id:claims.sub,name:typeof name==='string'?name.trim():'',
  email:typeof claims.email==='string'?claims.email:'',role:profile?.role??'customer'
 };
});
