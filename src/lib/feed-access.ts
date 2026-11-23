import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {isSupabaseConfigured} from '@/lib/supabase/config';

/** A função de autorização do banco repete essa regra para cada gravação. */
export async function requireFeedEditor(){
 if(!isSupabaseConfigured())redirect('/entrar');
 const db=await createClient();
 const {data}=await db.auth.getClaims();
 const id=data?.claims?.sub;
 if(!id||data?.claims?.is_anonymous===true)redirect('/entrar');
 const {data:profile,error}=await db.from('profiles')
  .select('role').eq('id',id).maybeSingle();
 if(error||!['admin','staff'].includes(profile?.role??''))redirect('/conta');
 return {db,userId:id,role:profile?.role??'staff'};
}
