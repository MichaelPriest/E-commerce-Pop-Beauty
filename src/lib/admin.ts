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

export async function readAdminProductCosts(
 supabase:Awaited<ReturnType<typeof createClient>>,productIds:string[]
){
 const costs=new Map<string,number>();
 if(!productIds.length)return {costs,error:null};
 const {data,error}=await supabase.rpc('admin_catalog_costs',{p_product_ids:productIds});
 for(const row of (data??[]) as {product_id:string;cost_cents:number}[]){
  costs.set(row.product_id,row.cost_cents);
 }
 return {costs,error};
}
