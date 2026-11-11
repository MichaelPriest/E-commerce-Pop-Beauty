/** Catálogo estático de provedores para AVALIAÇÃO, não uma lista de cobranças habilitadas. */
export const PAYMENT_GATEWAYS=[
 {
  id:'mercado_pago',name:'Mercado Pago',category:'Carteira e intermediador',
  integration:'Checkout Pro / Orders API',methods:['Pix','Cartão','Boleto'],
  envKeys:['MP_TEST_ACCESS_TOKEN'],
  docs:'https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/overview',
  summary:'Checkout hospedado; contas de teste para vendedor e comprador.',
  sandbox:'available',check:'remote'
 },
 {
  id:'pagbank',name:'PagBank',category:'Intermediador',
  integration:'Checkout / Links de pagamento',methods:['Pix','Cartão','Boleto'],
  envKeys:['PAGBANK_SANDBOX_TOKEN'],
  docs:'https://developer.pagbank.com.br/docs/checkout',
  summary:'Checkout hospedado; sandbox e produção em ambientes separados.',
  sandbox:'available',check:'credentials'
 },
 {
  id:'pagarme',name:'Pagar.me',category:'PSP e gateway',
  integration:'Checkout V5 / Links',methods:['Pix','Cartão','Boleto'],
  envKeys:['PAGARME_TEST_SECRET_KEY'],
  docs:'https://docs.pagar.me/docs/checkout-use',
  summary:'Links de pagamento da API V5 com chave de testes.',
  sandbox:'available',check:'remote'
 },
 {
  id:'asaas',name:'Asaas',category:'Gestão de recebíveis',
  integration:'Payment Links / API V3',methods:['Pix','Cartão','Boleto'],
  envKeys:['ASAAS_SANDBOX_API_KEY'],
  docs:'https://docs.asaas.com/docs/visao-geral',
  summary:'Cobranças e links hospedados, com conta de sandbox separada.',
  sandbox:'available',check:'remote'
 },
 {
  id:'stripe',name:'Stripe',category:'Plataforma de pagamentos',
  integration:'Checkout Sessions',methods:['Pix','Cartão','Boleto'],
  envKeys:['STRIPE_TEST_SECRET_KEY'],
  docs:'https://docs.stripe.com/payments/checkout',
  summary:'Checkout hospedado; disponibilidade de métodos depende da conta e do fluxo.',
  sandbox:'available',check:'remote'
 },
 {
  id:'efi',name:'Efí Bank',category:'Pix e cobranças',
  integration:'API Pix / Cobranças',methods:['Pix','Boleto','Cartão'],
  envKeys:['EFI_SANDBOX_CLIENT_ID','EFI_SANDBOX_CLIENT_SECRET','EFI_SANDBOX_CERT_BASE64'],
  docs:'https://dev.efipay.com.br/docs/api-pix/credenciais/',
  summary:'Pix com OAuth e certificado mTLS; a autenticação exige configuração específica.',
  sandbox:'available',check:'credentials'
 },
 {
  id:'paypal',name:'PayPal',category:'Pagamentos globais',
  integration:'PayPal Checkout / Orders',methods:['PayPal','Cartão'],
  envKeys:['PAYPAL_SANDBOX_CLIENT_ID','PAYPAL_SANDBOX_CLIENT_SECRET'],
  docs:'https://developer.paypal.com/docs/checkout/',
  summary:'Checkout PayPal e sandbox próprio; verifique elegibilidade e taxas no Brasil.',
  sandbox:'available',check:'remote'
 },
 {
  id:'cielo',name:'Cielo',category:'Adquirência',
  integration:'API E-commerce',methods:['Cartão','Pix','Boleto'],
  envKeys:['CIELO_SANDBOX_MERCHANT_ID','CIELO_SANDBOX_MERCHANT_KEY'],
  docs:'https://docs.cielo.com.br/ecommerce-cielo/reference/sobre-a-api',
  summary:'Integração transacional; alguns métodos precisam de habilitação específica.',
  sandbox:'available',check:'credentials'
 },
 {
  id:'iugu',name:'Iugu',category:'Gestão de cobrança',
  integration:'API de cobranças',methods:['Pix','Cartão','Boleto'],
  envKeys:['IUGU_TEST_API_TOKEN'],
  docs:'https://dev.iugu.com/',
  summary:'Cobranças via API; confirme a disponibilidade do ambiente de testes na sua conta.',
  sandbox:'verify',check:'credentials'
 },
 {
  id:'infinitepay',name:'InfinitePay',category:'Checkout e links',
  integration:'Checkout Integrado',methods:['Pix','Cartão'],
  envKeys:[],
  docs:'https://www.infinitepay.io/checkout-documentacao',
  summary:'Não possui sandbox. Testes por API podem gerar links de pagamento reais.',
  sandbox:'none',check:'none'
 }
] as const;

export type PaymentGatewayId=typeof PAYMENT_GATEWAYS[number]['id'];
export type PaymentGatewayDefinition=typeof PAYMENT_GATEWAYS[number];
export type PaymentGatewaySetting={
 provider:PaymentGatewayId;included_in_evaluation:boolean;preferred_for_sandbox:boolean;
 notes:string;updated_at:string;updated_by:string|null;
};
export const isPaymentGatewayId=(value:unknown):value is PaymentGatewayId=>
 typeof value==='string'&&PAYMENT_GATEWAYS.some(g=>g.id===value);
