import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';
export async function proxy(request: NextRequest) {
 // Webhook servidor-a-servidor: não exige cookies, nem cria/renova uma sessão de usuário.
 // A autenticação HMAC e o bloqueio do ambiente são feitos pela rota do webhook.
 if (request.nextUrl.pathname === '/api/webhooks/mercadopago/test') {
  return NextResponse.next({ request });
 }
 return updateSession(request);
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'] };
