import 'server-only';
import nodemailer from 'nodemailer';
import {pendingSmtpFields, type PreflightResult} from '@/lib/integration-preflight';

export function smtpConfigured() {
 return pendingSmtpFields(process.env).length === 0;
}

export function createOrderSmtpTransport(forceAuth = false) {
 const port = Number(process.env.SMTP_PORT);
 const secure = port === 465;
 return nodemailer.createTransport({
  host: process.env.SMTP_HOST?.trim(),
  port, secure, requireTLS: !secure, forceAuth,
  auth: {user: process.env.SMTP_USER!, pass: process.env.SMTP_PASSWORD!},
  connectionTimeout: 9000, greetingTimeout: 9000, socketTimeout: 12000,
  tls: {minVersion: 'TLSv1.2'}
 });
}

export async function verifyOrderSmtp(): Promise<PreflightResult> {
 // Alguns relays aceitam a conexão sem anunciar AUTH. O diagnóstico precisa verificar a credencial.
 const transport = createOrderSmtpTransport(true);
 try {
  await transport.verify();
  return {state:'ready', message:'O servidor SMTP aceitou a autenticação da loja.'};
 } catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code === 'EAUTH' || code === 'ENOAUTH') {
   return {state:'blocked', message:'O servidor recusou a autenticação. Confira SMTP_USER e SMTP_PASSWORD.'};
  }
  return {state:'blocked', message:'Falha na conexão SMTP. Confira SMTP_HOST, SMTP_PORT e o suporte a TLS do provedor.'};
 } finally {
  transport.close();
 }
}
