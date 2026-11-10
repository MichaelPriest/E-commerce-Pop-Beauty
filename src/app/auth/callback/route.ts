import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
export async function GET(request:NextRequest) {
 const {searchParams,origin}=new URL(request.url);
 const code=searchParams.get('code');
 const next=searchParams.get('next')||'/conta';
 const safeNext=next.startsWith('/')&&!next.startsWith('//')&&!next.includes('\\')?next:'/conta';
 if(!isSupabaseConfigured()||!code) return NextResponse.redirect(new URL('/entrar',origin));
 const supabase=await createClient();
 const {error}=await supabase.auth.exchangeCodeForSession(code);
 if(error) return NextResponse.redirect(new URL('/entrar?erro=confirmacao',origin));
 return NextResponse.redirect(new URL(safeNext,origin));
}
