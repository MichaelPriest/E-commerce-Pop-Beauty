/** Adaptadores de preparação: NENHUMA chamada externa e NENHUM payload de compra. */
import type {PreparedVolume,ShipmentCheck} from './shipment-preparation';

export type ShippingProvider='melhor_envio'|'correios';
export type ProviderDraft={
 order_id:string;provider:ShippingProvider;service_code:string|null;
 operator_notes:string|null;revision:number;draft_token:string;
};
export type ProviderDescription={
 label:string;workflow:readonly string[];documentation_url:string;
 contract_checks:readonly string[];
};
export const PROVIDERS:Record<ShippingProvider,ProviderDescription>={
 melhor_envio:{
  label:'Melhor Envio',
  workflow:['Cotação no ambiente escolhido','Inclusão no carrinho','Checkout de frete',
   'Geração de etiqueta','Impressão da etiqueta','Acompanhamento / cancelamento'],
  documentation_url:'https://docs.melhorenvio.com.br/reference/inserir-fretes-no-carrinho',
  contract_checks:[
   'Validar serviço e preço por cotação vigente da API antes de criar carrinho',
   'Conferir endereço e documentação de remetente e destinatário exigidos pelo serviço',
   'Confirmar dados fiscais/declaratórios e termos de coleta/postagem',
   'Implementar armazenamento seguro dos IDs retornados, compra idempotente, cancelamento e estorno'
  ]
 },
 correios:{
  label:'Correios — Pré-postagem',
  workflow:['Validação de credenciais e serviço','Preparação de pré-postagem',
   'Geração de identificador e etiqueta','Postagem confirmada pelos Correios',
   'Rastreamento / serviços pós-postagem'],
  documentation_url:'https://www.correios.com.br/atendimento/developers/manual-do-usuario-ppn',
  contract_checks:[
   'Validar acesso, modalidade de postagem e contrato/serviço habilitado',
   'Conferir remetente, destinatário, conteúdo e exigências de pré-postagem',
   'Validar documentação fiscal ou declaração exigida para a operação',
   'Integrar retorno oficial de pré-postagem, identificador, etiquetas e eventos de rastreio'
  ]
 }
};

export function isShippingProvider(value:unknown):value is ShippingProvider{
 return value==='melhor_envio'||value==='correios';
}
export function providerPreparationReview(input:{
 orderId:string;draft:ProviderDraft|null;check:ShipmentCheck;volumes:PreparedVolume[];
}){
 const {draft,check,orderId,volumes}=input;
 const provider=draft?.provider&&isShippingProvider(draft.provider)?draft.provider:null;
 const descriptor=provider?PROVIDERS[provider]:null;
 const issues=[...check.issues];
 if(!provider)issues.push('Selecione e salve o provedor de frete para esta remessa.');
 if(provider&&!draft?.service_code)
  issues.push('Código de serviço ainda não preenchido (será validado em cotação oficial).');
 const normalizedPackages=[...volumes].sort((a,b)=>a.volume_number-b.volume_number)
  .map(v=>({
   reference:'V'+String(v.volume_number).padStart(2,'0'),
   number:v.volume_number,weight_g:v.weight_g,
   dimensions_cm:{height:v.height_cm,width:v.width_cm,length:v.length_cm},
   contents_note:v.contents_note??null
  }));
 return {
  format:'pope.shipping.provider-review.v1',
  order_id:orderId,
  provider,
  provider_label:descriptor?.label??null,
  service_code_unverified:draft?.service_code??null,
  operator_notes:draft?.operator_notes??null,
  revision:draft?.revision??null,
  draft_token:draft?.draft_token??null,
  workflow:descriptor?.workflow??[],
  documentation_url:descriptor?.documentation_url??null,
  basic_data_issues:issues,
  external_prerequisites:descriptor?.contract_checks??[],
  parcels:normalizedPackages,
  ready_for_internal_review:issues.length===0,
  ready_for_provider_request:false,
  ready_for_label_purchase:false,
  provider_request_performed:false,
  quotation_performed:false,
  cart_created:false,
  shipment_purchased:false,
  label_generated:false,
  official_tracking_created:false,
  financial_transaction_performed:false
 };
}
