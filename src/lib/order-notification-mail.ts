import 'server-only';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import nodemailer from 'nodemailer';
import type {createClient} from '@/lib/supabase/server';

type DbClient=Awaited<ReturnType<typeof createClient>>;
type DeliveryClaim={
 id:string;claim_token:string;order_id:string;event_type:string;
 recipient_email:string;recipient_name:string;total_cents:number;
 carrier:string|null;tracking_code:string|null;
};
type DeliveryResult={processed:number;sent:number;failed:number;configured:boolean;notice:string};
type QueueOptions={notificationId?:string;orderId?:string;max?:number};

const definitions:Record<string,{file:string;subject:string;label:string}>={
 created:{file:'01-pedido-registrado.html',subject:'Recebemos seu pedido',label:'Pedido registrado'},
 payment_confirmed:{file:'02-pagamento-confirmado.html',subject:'Pagamento confirmado',label:'Pagamento confirmado'},
 shipped:{file:'03-pedido-enviado.html',subject:'Pedido enviado',label:'Pedido enviado'},
 delivered:{file:'04-pedido-entregue.html',subject:'Pedido entregue',label:'Pedido entregue'},
 cancelled:{file:'05-pedido-cancelado.html',subject:'Pedido cancelado',label:'Pedido cancelado'},
};
const escapeHTML=(input:string)=>input.replace(/[&<>"']/g,char=>
 ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]||char));
export function smtpConfigured(){
 const keys=['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD','SMTP_FROM_EMAIL'];
 return keys.every(key=>Boolean(process.env[key]?.trim()));
}
const brl=(cents:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);

async function makeContent(claim:DeliveryClaim){
 const definition=definitions[claim.event_type];
 if(!definition)throw new Error('Tipo de template desconhecido');
 let html=await readFile(join(process.cwd(),'emails','pedidos',definition.file),'utf8');
 const shortId='#'+claim.order_id.slice(0,8).toUpperCase();
 const customer=claim.recipient_name.trim().slice(0,120)||'cliente';
 const fields:Record<string,string>={
  CLIENTE:customer,PEDIDO:shortId,VALOR_TOTAL:brl(claim.total_cents),
  TRANSPORTADORA:claim.carrier??'Não informado',
  RASTREIO:claim.tracking_code??'Não informado',
  MOTIVO:'Cancelamento registrado pela loja. Entre em contato para mais informações.'
 };
 for(const [name,value] of Object.entries(fields)){
  html=html.replaceAll('[['+name+']]',escapeHTML(value));
 }
 if(/\[\[[A-Z_]+\]\]/.test(html))throw new Error('O template possui campos não preenchidos');
 const subject='Popê Beauty | '+definition.subject+' '+shortId;
 const text=[
  'Popê Beauty — '+definition.label,
  'Olá, '+customer+'.',
  'Pedido: '+shortId,
  'Total: '+brl(claim.total_cents),
  claim.event_type==='created'?'Aguardando confirmação do pagamento. Este e-mail não confirma recebimento.':'',
  claim.event_type==='shipped'?'Transportadora: '+fields.TRANSPORTADORA+' | Rastreio: '+fields.RASTREIO:'',
  claim.event_type==='cancelled'?'O cancelamento não comprova a realização de um estorno.':'',
  'Acesse sua conta em https://e-commerce-pope-beauty.vercel.app/conta',
  'Contato: popebeauty.e@gmail.com'
 ].filter(Boolean).join('\n');
 return {html,text,subject};
}
function smtpError(error:unknown){
 const raw=error&&typeof error==='object'&&'code' in error?String(error.code):'SMTP_ERROR';
 // Não gravar mensagens arbitrárias de transportadora: podem conter credenciais.
 return 'Não foi possível enviar pelo SMTP (código: '+raw.replace(/[^A-Z0-9_]/gi,'').slice(0,35)+'). Verifique a configuração do servidor.';
}
export async function processOrderNotificationQueue(sb:DbClient,{notificationId,orderId,max=1}:QueueOptions={}):Promise<DeliveryResult>{
 if(!smtpConfigured())return {processed:0,sent:0,failed:0,configured:false,
  notice:'SMTP de pedidos ainda não configurado na Vercel. As mensagens permanecem na fila.'};
 let sent=0,failed=0,processed=0;
 const amount=Math.min(3,Math.max(1,max));
 for(let i=0;i<amount;i++){
  const {data,error:claimError}=await sb.rpc('claim_order_notification',{
   p_notification_id:notificationId??null,p_order_id:orderId??null
  });
  if(claimError)throw new Error('Não foi possível acessar a fila: '+claimError.message);
  if(!data)break;
  const job=data as DeliveryClaim;
  processed+=1;
  try{
   const {html,text,subject}=await makeContent(job);
   const port=Number(process.env.SMTP_PORT);
   if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid SMTP port');
   const secure=port===465;
   const transporter=nodemailer.createTransport({
    host:process.env.SMTP_HOST!,
    port,secure,requireTLS:!secure,
    auth:{user:process.env.SMTP_USER!,pass:process.env.SMTP_PASSWORD!},
    connectionTimeout:9000,greetingTimeout:9000,socketTimeout:12000,
    tls:{minVersion:'TLSv1.2'}
   });
   try{
    const info=await transporter.sendMail({
     from:{name:'Popê Beauty',address:process.env.SMTP_FROM_EMAIL!},
     to:[{address:job.recipient_email}],
     replyTo:{address:'popebeauty.e@gmail.com',name:'Popê Beauty'},
     subject,html,text,
     headers:{'X-Pope-Order':job.order_id},
     disableFileAccess:true,disableUrlAccess:true
    });
    const {error:finishError}=await sb.rpc('finish_order_notification',{
     p_notification_id:job.id,p_claim_token:job.claim_token,
     p_success:true,p_message_id:info.messageId??null,p_error:null
    });
    if(finishError)throw new Error('O SMTP aceitou a mensagem, mas não foi possível registrar o resultado: '+finishError.message);
    sent++;
   }finally{
    transporter.close();
   }
  }catch(error){
   failed++;
   const {error:finishError}=await sb.rpc('finish_order_notification',{
    p_notification_id:job.id,p_claim_token:job.claim_token,
    p_success:false,p_message_id:null,p_error:smtpError(error)
   });
   if(finishError)throw new Error('Erro ao registrar falha no envio: '+finishError.message);
  }
 }
 return {processed,sent,failed,configured:true,
  notice:sent?'Notificações enviadas por SMTP.':failed?'O envio falhou. Confira o SMTP e tente novamente.':'Nenhuma notificação pendente para enviar.'};
}
