import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

/** Checks the authenticated user and reads the role from the protected table. */
export async function requireAdmin() {
 if (!isSupabaseConfigured()) redirect('/entrar');
 const supabase = await createClient();
 const {data:claimsData,error:authError} = await supabase.auth.getClaims();
 if (authError || !claimsData?.claims?.sub) redirect('/entrar');
 const {data:profile,error} = await supabase.from('profiles')
  .select('role').eq('id',claimsData.claims.sub).maybeSingle();
 if (error || profile?.role !== 'admin') redirect('/conta');
 return supabase;
}
