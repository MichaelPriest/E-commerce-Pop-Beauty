'use server';
import { redirect } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
export async function signOutAction() {
 if(isSupabaseConfigured()){const supabase=await createClient();await supabase.auth.signOut();}
 redirect('/entrar');
}
