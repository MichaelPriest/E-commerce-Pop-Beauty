import Link from 'next/link';
import {
 ClipboardCheck,ShieldAlert,ShieldCheck,PackageSearch,
 Truck,CreditCard,MailCheck,ExternalLink,ArrowLeft,AlertTriangle
} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {sandboxPreferenceEnabled} from '@/lib/payments/mercado-pago-test';
import {mpTestWebhookEnabled} from '@/lib/payments/mp-webhook-test';
import {mpLivePaymentConfig} from '@/lib/payments/mercado-pago-live';
import {focusConfig} from '@/lib/fiscal/focus-nfe';
import {labelConfig} from '@/lib/shipping/melhor-envio-label';
import {fiscalIssuerIssues} from '@/lib/fiscal/readiness-core';
import {auditFiscalCatalog,type FiscalAuditProduct} from '@/lib/fiscal-catalog-audit';
import {integrationPreflight} from '@/lib/integration-preflight';
import {IntegrationChecks} from './integration-checks';
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
 const [productCount,variantData,shippingOrigin,deliveryRates,gateways,settings,suppliers,receipts,issuer,fiscalProducts]=await Promise.all([
  sb.from('products').select('id',{head:true,count:'exact'}).eq('active',true).eq('is_adult',false),
  sb.from('variants').select(
   'id,products!inner(id),variant_shipping_specs(weight_g,height_cm,width_cm,length_cm)'
  ).eq('active',true).eq('products.active',true).eq('products.is_adult',false).limit(501),
  sb.from('shipping_origin_settings').select('origin_postal_code').eq('id',1).maybeSingle(),
  sb.from('checkout_delivery_rates').select('id',{head:true,count:'exact'}).eq('active',true),
  sb.from('payment_gateway_settings').select('provider')
   .eq('preferred_for_sandbox',true).limit(1),
  sb.from('store_settings').select('checkout_reservations_enabled,commercial_checkout_enabled').eq('id',1).maybeSingle(),
  sb.from('suppliers').select('id',{head:true,count:'exact'}).eq('active',true),
  sb.from('goods_receipts').select('id,status').order('created_at',{ascending:false}).limit(150),
  sb.from('fiscal_issuer_settings').select('legal_name,cnpj,state_registration,tax_regime,state_code,city,city_ibge_code,postal_code,street,house_number,district').eq('id',1).maybeSingle(),
  sb.from('products').select('id,name,brand,active,is_adult,product_fiscal_details(*)').eq('active',true).eq('is_adult',false).limit(501),
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
 const integrationCards=integrationPreflight(process.env);
 const smtpReady=integrationCards.some(card=>card.id==='smtp'&&card.missing.length===0);
 const gatewayCandidate=!gateways.error&&!!gateways.data?.length;
 const checkoutDisabled=!settings.error&&settings.data?.checkout_reservations_enabled===false;
 const livePayments=mpLivePaymentConfig();
 const focus=focusConfig(),labels=labelConfig();
 const checkoutOpen=Boolean(livePayments?.linkOrigin&&settings.data?.commercial_checkout_enabled);
 const issuerIssues=fiscalIssuerIssues(issuer.data??null);
 const productFiscalAudit=auditFiscalCatalog((fiscalProducts.data??[]) as FiscalAuditProduct[],issuer.data?.tax_regime??null);
 const productsWithPendingTax=productFiscalAudit.filter(item=>!item.readyForReview).length;
 const fiscalCoverage=activeProducts!==null&&productFiscalAudit.length===activeProducts;

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
  {id:'delivery-rates',group:'Logística',title:'Tarifas por CEP',
   detail:deliveryRates.error?'Não foi possível consultar as faixas.':
    (deliveryRates.count??0)+' faixa(s) ativa(s) para cálculo da entrega no checkout.',
   state:(deliveryRates.count??0)>0?'ready':'pending',href:'/admin/frete/tarifas',action:'Ver tarifas'},
  {id:'shipping-prod',group:'Logística',title:'Frete e etiquetas em produção',
   detail:labels?'Melhor Envio configurado em '+labels.environment+'. Confira uma compra de frete com NF-e autorizada.':
    'Cotação, compra, impressão e rastreio desenvolvidos. Aguardando credenciais e dados do remetente.',
   state:labels?.environment==='producao'?'manual':'blocked',href:'/admin/pedidos',action:'Abrir operação de pedidos'},
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
  {id:'mp-order-links',group:'Pagamentos',title:'Links de pagamento para pedidos internos',
   detail:livePayments?.linkOrigin?'Configuração presente. Confira os retornos no provedor antes de usar.':
    'Geração e conciliação desenvolvidas. Aguardando credenciais e homologação com a conta vendedora.',
   state:livePayments?.linkOrigin?'manual':'pending',href:'/admin/pedidos',action:'Abrir pedidos internos'},
  {id:'checkout-prod',group:'Pagamentos',title:'Checkout público comercial',
   detail:checkoutOpen?'Pedidos públicos habilitados com pagamento pelo Mercado Pago.':
    'Pedido com entrega, pagamento, cancelamento e estorno desenvolvidos. A abertura aguarda homologação e configuração.',
   state:checkoutOpen?'ready':'blocked',href:'/checkout',action:'Ver checkout'},
  {id:'smtp',group:'Operação',title:'Entrega de e-mails de pedidos',
   detail:smtpReady?'Campos SMTP preenchidos. Confirme o recebimento de uma notificação de pedido na caixa de destino.':
    'Confira os campos indicados na configuração de e-mails de pedidos.',
   state:smtpReady?'manual':'pending',
   href:smtpReady?'/admin/notificacoes':'#integracao-smtp',action:smtpReady?'Ver notificações':'Conferir SMTP'},
  {id:'suppliers',group:'Operação',title:'Cadastro de fornecedores',
   detail:suppliers.error?'Não foi possível consultar fornecedores.':
    (suppliers.count??0)+' fornecedor(es) ativo(s). Cadastre fornecedores para rastrear compras e recebimentos.',
   state:!suppliers.error&&(suppliers.count??0)>0?'ready':'pending',
   href:'/admin/fornecedores',action:'Cadastrar fornecedores'},
  {id:'goods-receipts',group:'Operação',title:'Conferência e recebimento de mercadorias',
   detail:receipts.error?'Não foi possível consultar a conferência.':
    (receipts.data??[]).filter(r=>r.status==='draft').length+
    ' rascunho(s) aguardando contabilização; '+
    (receipts.data??[]).filter(r=>r.status==='posted').length+
    ' entrada(s) contabilizada(s), até 150 últimas.',
   state:receipts.error?'pending':(receipts.data??[]).some(r=>r.status==='draft')?
    'pending':'ready',href:'/admin/estoque/recebimento',action:'Conferir recebimentos'},
  {id:'fiscal',group:'Operação',title:'Emissão de NF-e modelo 55',
   detail:focus?'Focus NFe configurado em '+focus.environment+'. Confira emitente, produtos e autorização fiscal.':
    'Emissão, consulta, XML, DANFE e cancelamento desenvolvidos. Aguardando credenciais e cadastro fiscal.',
   state:focus?'manual':'pending',href:'/admin/fiscal',action:'Conferir cadastro fiscal'},
  {id:'fiscal-issuer',group:'Operação',title:'Dados do emitente',
   detail:issuer.error?'Cadastro fiscal indisponível.':issuerIssues.length?issuerIssues.join(' · '):
    'Identificação, regime e endereço fiscal preenchidos. Confira o credenciamento no emissor.',
   state:!issuer.error&&issuerIssues.length===0?'manual':'pending',href:'/admin/fiscal',action:'Preencher emitente'},
  {id:'fiscal-items',group:'Catálogo',title:'Dados fiscais dos produtos ativos',
   detail:fiscalProducts.error?'Não foi possível consultar a tributação dos produtos.':
    `${productsWithPendingTax} de ${productFiscalAudit.length} produtos consultados têm pendências de preenchimento.`+
    (fiscalCoverage?'':' Confira os demais no cadastro fiscal.'),
   state:!fiscalProducts.error&&fiscalCoverage&&productFiscalAudit.length>0&&productsWithPendingTax===0?'manual':'pending',
   href:'/admin/fiscal',action:'Conferir produtos'},
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
   <div><h2>{checkoutOpen?'Checkout comercial habilitado':'Checkout comercial aguardando abertura'}</h2>
    <p>Confira a configuração dos provedores e a operação da loja antes do lançamento.</p></div>
  </section>
  <IntegrationChecks cards={integrationCards}/>
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
