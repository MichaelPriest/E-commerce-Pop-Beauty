import Link from 'next/link';
import {
 ClipboardCheck,ShieldAlert,ShieldCheck,PackageSearch,
 Truck,CreditCard,MailCheck,ExternalLink,ArrowLeft,AlertTriangle
} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {sandboxPreferenceEnabled} from '@/lib/payments/mercado-pago-test';
import {mpTestWebhookEnabled} from '@/lib/payments/mp-webhook-test';
import {
 READINESS_LABELS,summarizeReadiness,type ReadinessItem,type ReadinessState
} from '@/lib/release-readiness';

export const dynamic='force-dynamic';
export const metadata={title:'Prontidão de lançamento | Popê Beauty'};

function statusClass(state:ReadinessState){
 return 'pope-readiness-status state-'+state;
}
export default async function AdminReadinessPage(){
 const sb=await requireAdmin();
 const [productCount,variantData,shippingOrigin,gateways,settings]=await Promise.all([
  sb.from('products').select('id',{head:true,count:'exact'}).eq('active',true).eq('is_adult',false),
  sb.from('variants').select(
   'id,variant_shipping_specs(weight_g,height_cm,width_cm,length_cm)'
  ).eq('active',true).limit(501),
  sb.from('shipping_origin_settings').select('origin_postal_code').eq('id',1).maybeSingle(),
  sb.from('payment_gateway_settings').select('provider')
   .eq('preferred_for_sandbox',true).limit(1),
  sb.from('store_settings').select('checkout_reservations_enabled').eq('id',1).maybeSingle()
 ]);
 const activeProducts=productCount.error?null:(productCount.count??0);
 const variants=variantData.data??[];
 const variantsComplete=variantData.error?null:variants.filter(v=>{
  const data=Array.isArray(v.variant_shipping_specs)?
   v.variant_shipping_specs[0]:v.variant_shipping_specs;
  return Boolean(data&&data.weight_g>0&&data.height_cm>0&&
   data.width_cm>0&&data.length_cm>0);
 }).length;
 const packaged=variantsComplete!==null&&variants.length>0&&
  variants.length<501&&variantsComplete===variants.length;
 const originReady=!shippingOrigin.error&&
  /^\d{8}$/.test(shippingOrigin.data?.origin_postal_code??'');
 const smtpKeys=['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_FROM_EMAIL','SMTP_PASSWORD'];
 const smtpCount=smtpKeys.filter(key=>Boolean(process.env[key]?.trim())).length;
 const gatewayCandidate=!gateways.error&&!!gateways.data?.length;
 const checkoutDisabled=!settings.error&&settings.data?.checkout_reservations_enabled===false;

 const checks:ReadinessItem[]=[
  {id:'build',group:'Técnico',title:'Dependências e testes automatizados',
   detail:'package-lock.json versionado, CI com npm ci e testes/compilação em alterações no GitHub.',
   state:'ready',href:'https://github.com/MichaelPriest/E-commerce-Pop-Beauty/actions',
   action:'Ver GitHub Actions'},
  {id:'checkout-off',group:'Técnico',title:'Proteção durante a homologação',
   detail:checkoutDisabled?'Reservas públicas continuam desativadas no Supabase.':
    'Não foi possível confirmar o bloqueio público. Revisar imediatamente a configuração.',
   state:checkoutDisabled?'ready':'pending',href:'/admin/configuracoes',action:'Ver configurações'},
  {id:'catalog',group:'Catálogo',title:'Produtos públicos cadastrados',
   detail:activeProducts===null?'Consulta ao catálogo indisponível.':
    activeProducts+' produto(s) comum(ns) ativo(s). Conferir preços, fotos, saldos e regularização dos cosméticos.',
   state:activeProducts!==null&&activeProducts>0?'ready':'pending',
   href:'/admin/produtos',action:'Gerenciar catálogo'},
  {id:'packaging',group:'Logística',title:'Peso e dimensões dos SKUs',
   detail:variantsComplete===null?'Não foi possível consultar as dimensões.':
    variantsComplete+' de '+variants.length+
    (variants.length>=501?' primeiras':'')+' variação(ões) ativa(s) com medidas completas.',
   state:packaged?'ready':'pending',
   href:'/admin/frete',action:'Preencher embalagens'},
  {id:'origin',group:'Logística',title:'CEP real de postagem',
   detail:originReady?'CEP de origem com oito dígitos cadastrado.':
    'CEP de origem ainda não cadastrado ou não pôde ser verificado.',
   state:originReady?'ready':'pending',
   href:'/admin/frete',action:'Cadastrar origem'},
  {id:'shipping-prod',group:'Logística',title:'Frete e etiquetas em produção',
   detail:'A cotação atual é de sandbox; faltam integração comercial, revalidação de frete e geração de etiquetas.',
   state:'blocked',href:'/admin/frete',action:'Ver módulo de frete'},
  {id:'gateway-test',group:'Pagamentos',title:'Gateway candidato à homologação',
   detail:gatewayCandidate?'Há um candidato para testes; isto não habilita cobrança.':
    'Nenhum provedor foi selecionado para homologação.',
   state:gatewayCandidate?'ready':'pending',
   href:'/admin/gateways',action:'Comparar gateways'},
  {id:'mp-test',group:'Pagamentos',title:'Mercado Pago — preparação de testes',
   detail:sandboxPreferenceEnabled()?'Configuração TEST presente; ainda é necessária validação com contas de teste.':
    'Credenciais e habilitação explícita do Checkout Pro TEST não estão completas.',
   state:sandboxPreferenceEnabled()?'ready':'pending',
   href:'/admin/pagamentos',action:'Abrir homologação'},
  {id:'mp-webhook',group:'Pagamentos',title:'Mercado Pago — webhook TEST',
   detail:mpTestWebhookEnabled()?'Variáveis TEST presentes. Confirmar HMAC e retorno com evento real de teste.':
    'Webhook de teste continua bloqueado até configurar segredo, conta TEST e acesso de servidor.',
   state:mpTestWebhookEnabled()?'ready':'pending',
   href:'/admin/pagamentos',action:'Conferir auditoria'},
  {id:'checkout-prod',group:'Pagamentos',title:'Checkout comercial e conciliação financeira',
   detail:'Faltam pedidos reais com total final, confirmação de pagamento pelo provedor, estornos e proteção contra atrasos de liquidação.',
   state:'blocked',href:'/checkout',action:'Ver prévia atual'},
  {id:'smtp',group:'Operação',title:'Notificações por e-mail',
   detail:smtpCount+' de '+smtpKeys.length+' variáveis SMTP de pedidos presentes. A entrega precisa de teste real.',
   state:smtpCount===smtpKeys.length?'ready':'pending',
   href:'/admin/notificacoes',action:'Ver notificações'},
  {id:'fiscal',group:'Operação',title:'Emissão fiscal',
   detail:'Definir com a contabilidade a emissão aplicável (NF-e/NFC-e) e integrar o processo aos pedidos.',
   state:'manual'},
  {id:'legal',group:'Operação',title:'Políticas e atendimento ao consumidor',
   detail:'Publicar termos, privacidade/LGPD, trocas, devoluções, frete, contatos e identificação do fornecedor.',
   state:'manual'},
  {id:'security',group:'Técnico',title:'Liberação e segurança finais',
   detail:'Confirmar proteção de senha vazada no Supabase, regras obrigatórias de PR/CI e testes reais de backup e recuperação.',
   state:'manual'}
 ];
 const summary=summarizeReadiness(checks);
 const groups=['Técnico','Catálogo','Logística','Pagamentos','Operação'] as const;
 return <div className="container admin-workspace pope-readiness-page">
  <div className="admin-top">
   <div><div className="section-kicker">QUALIDADE • PREPARAÇÃO PARA O LANÇAMENTO</div>
    <h1><ClipboardCheck size={29}/> Prontidão para produção</h1>
    <p>Acompanhamento somente leitura das condições técnicas da Popê Beauty.</p>
   </div>
   <Link href="/admin" className="admin-outline"><ArrowLeft size={17}/> Dashboard</Link>
  </div>
  <section className="pope-readiness-banner" role="status">
   <ShieldAlert size={28}/>
   <div><h2>Vendas reais ainda não autorizadas</h2>
    <p>Esta página não libera pagamentos, reservas públicas ou expedição.
     Configurações presentes não substituem testes com provedores e aprovação operacional.</p></div>
  </section>
  <div className="admin-metric-row">
   <div><ShieldCheck/><small>Itens verificados</small><strong>{summary.ready}</strong></div>
   <div><AlertTriangle/><small>Pendências técnicas</small><strong>{summary.pending}</strong></div>
   <div><ShieldAlert/><small>Bloqueios de produção</small><strong>{summary.blocked}</strong></div>
   <div><ClipboardCheck/><small>Revisão manual</small><strong>{summary.manual}</strong></div>
  </div>
  <div className="pope-readiness-legend">
   <span className="pope-readiness-status state-ready">Verificado</span>
   <span className="pope-readiness-status state-pending">Pendente</span>
   <span className="pope-readiness-status state-blocked">Bloqueio de produção</span>
   <span className="pope-readiness-status state-manual">Exige validação manual</span>
  </div>
  {groups.map(group=><section className="pope-readiness-group" key={group}>
   <h2>{group==='Técnico'?<ShieldCheck size={20}/>:
     group==='Catálogo'?<PackageSearch size={20}/>:
     group==='Logística'?<Truck size={20}/>:
     group==='Pagamentos'?<CreditCard size={20}/>:<MailCheck size={20}/>}
    {group}</h2>
   <div className="pope-readiness-grid">
    {checks.filter(item=>item.group===group).map(item=><article key={item.id} className="pope-readiness-item">
     <div className="pope-readiness-item-title">
      <strong>{item.title}</strong>
      <span className={statusClass(item.state)}>{READINESS_LABELS[item.state]}</span>
     </div>
     <p>{item.detail}</p>
     {item.href?<Link href={item.href} target={item.href.startsWith('https://')?'_blank':undefined}
      rel={item.href.startsWith('https://')?'noopener noreferrer':undefined}>
      {item.action??'Abrir módulo'} <ExternalLink size={14}/></Link>:null}
    </article>)}
   </div>
  </section>)}
  <p className="pope-readiness-footnote">
   <ShieldAlert size={16}/> Dados atualizados no carregamento desta página;
   configurações de servidor mostram apenas presença, nunca o conteúdo de credenciais.
   Condições marcadas “verificado” não representam aprovação geral de produção.
   Nenhum botão nesta página altera a configuração comercial.
  </p>
 </div>;
}
