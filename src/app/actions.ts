'use server';
import { redirect } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
export async function signOutAction() {
 if(isSupabaseConfigured()){
  const supabase=await createClient();
  try{await supabase.rpc('end_user_session_presence');}
  catch{ /* Não bloquear saída se a presença falhar. */ }
  await supabase.auth.signOut();
 }
 redirect('/entrar');
}
