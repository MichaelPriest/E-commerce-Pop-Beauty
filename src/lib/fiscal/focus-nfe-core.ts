export type FocusOrderItem={sku:string;title:string;quantity:number;priceCents:number;tax:Record<string,unknown>};
export type FocusOrderData={totalCents:number;freightCents:number;issuer:Record<string,unknown>;
 recipient:Record<string,unknown>;address:Record<string,unknown>;nature:string;items:FocusOrderItem[]};

export function decimalCents(value:unknown):number|null{
 const raw=typeof value==='string'||typeof value==='number'?String(value):'';
 if(!/^\d{1,9}(\.\d{1,2})?$/.test(raw))return null;
 const [whole,decimal='']=raw.split('.');
 return Number(whole)*100+Number(decimal.padEnd(2,'0'));
}

export function focusDraft(order:FocusOrderData){
 const {issuer,recipient,address,items}=order;
 const subtotal=order.totalCents-order.freightCents;
 let accumulated=0,allocated=0;
 const simple=issuer.tax_regime===1||issuer.tax_regime===4;
 const taxId=String(recipient.tax_id??'');
 return {
  natureza_operacao:order.nature||'Venda de mercadoria',tipo_documento:1,finalidade_emissao:1,
  local_destino:issuer.state_code===address.state_code?1:2,consumidor_final:1,presenca_comprador:2,
  modalidade_frete:0,cnpj_emitente:issuer.cnpj,nome_emitente:issuer.legal_name,
  inscricao_estadual_emitente:issuer.state_registration,regime_tributario_emitente:issuer.tax_regime,
  logradouro_emitente:issuer.street,numero_emitente:issuer.house_number,bairro_emitente:issuer.district,
  municipio_emitente:issuer.city,uf_emitente:issuer.state_code,cep_emitente:issuer.postal_code,
  nome_destinatario:recipient.full_name,
  ...(taxId.length===11?{cpf_destinatario:taxId}:{cnpj_destinatario:taxId}),
  indicador_inscricao_estadual_destinatario:recipient.state_registration?1:9,
  ...(recipient.state_registration?{inscricao_estadual_destinatario:recipient.state_registration}:{}),
  logradouro_destinatario:address.street,numero_destinatario:address.house_number,
  complemento_destinatario:address.complement,bairro_destinatario:address.district,
  municipio_destinatario:address.city,uf_destinatario:address.state_code,cep_destinatario:address.postal_code,
  valor_produtos:subtotal/100,valor_frete:order.freightCents/100,valor_total:order.totalCents/100,
  formas_pagamento:[{forma_pagamento:'',valor_pagamento:order.totalCents/100}],
  items:items.map((i,index)=>{
   accumulated+=i.quantity*i.priceCents;
   const share=subtotal>0?Math.round(order.freightCents*accumulated/subtotal):0;
   const freight=share-allocated;allocated=share;
   const t=i.tax;
   return {numero_item:index+1,codigo_produto:i.sku,descricao:i.title,codigo_ncm:t.ncm??'',
    cest:t.cest??undefined,cfop:t.cfop_sale??'',unidade_comercial:t.commercial_unit??'',
    quantidade_comercial:i.quantity,valor_unitario_comercial:i.priceCents/100,
    valor_bruto:i.priceCents*i.quantity/100,valor_frete:freight/100,
    unidade_tributavel:t.commercial_unit??'',quantidade_tributavel:i.quantity,valor_unitario_tributavel:i.priceCents/100,
    inclui_no_total:1,icms_origem:t.tax_origin,icms_situacao_tributaria:(simple?t.csosn:t.icms_cst)??'',
    pis_situacao_tributaria:t.pis_cst??'',cofins_situacao_tributaria:t.cofins_cst??''};
  }),
 };
}

export function focusPayloadIssue(payload:Record<string,unknown>,order:FocusOrderData){
 const items=payload.items;
 const payments=payload.formas_pagamento;
 const digits=(value:unknown,expected:string)=>new RegExp('^'+expected+'$').test(String(value??''));
 const cpf=String(order.recipient.tax_id??'').length===11;
 if(String(payload.cnpj_emitente)!==String(order.issuer.cnpj)||
    String(cpf?payload.cpf_destinatario:payload.cnpj_destinatario)!==String(order.recipient.tax_id)||
    Boolean(cpf?payload.cnpj_destinatario:payload.cpf_destinatario)||
    String(payload.cep_emitente)!==String(order.issuer.postal_code)||
    String(payload.cep_destinatario)!==String(order.address.postal_code)||
    String(payload.uf_destinatario)!==String(order.address.state_code)||
    Number(payload.tipo_documento)!==1||Number(payload.finalidade_emissao)!==1||
    decimalCents(payload.valor_total)!==order.totalCents||decimalCents(payload.valor_frete??0)!==order.freightCents||
    decimalCents(payload.valor_produtos)!==order.totalCents-order.freightCents){
  return 'Emitente, destinatário, operação e valores devem corresponder ao pedido.';
 }
 if(!Array.isArray(items)||items.length!==order.items.length||!items.length)return 'Confira os itens da nota.';
 const expected=new Map(order.items.map(item=>[item.sku,item]));
 let freight=0;
 for(const i of items){
  const line=expected.get(i?.codigo_produto);
  const fee=decimalCents(i?.valor_frete??0);
  if(!line||Number(i.quantidade_comercial)!==line.quantity||decimalCents(i.valor_unitario_comercial)!==line.priceCents||
     decimalCents(i.valor_bruto)!==line.quantity*line.priceCents||fee===null||Number(i.inclui_no_total)!==1){
   return 'Conferência dos SKU, quantidades e valores da nota falhou.';
  }
  if(!digits(i.codigo_ncm,'[0-9]{8}')||!digits(i.cfop,'[0-9]{4}')||!String(i.unidade_comercial??'').trim()||
     !digits(i.icms_origem,'[0-8]')||!digits(i.icms_situacao_tributaria,'[0-9]{2,3}')||
     !digits(i.pis_situacao_tributaria,'[0-9]{2}')||!digits(i.cofins_situacao_tributaria,'[0-9]{2}')){
   return 'Complete NCM, CFOP, unidade e tributos em cada item com os dados da contabilidade.';
  }
  expected.delete(line.sku);freight+=fee;
 }
 if(freight!==order.freightCents)return 'O frete dos itens deve fechar com o frete do pedido.';
 if(!Array.isArray(payments)||!payments.length||payments.some(p=>!digits(p?.forma_pagamento,'[0-9]{2}')||decimalCents(p?.valor_pagamento)===null)||
    payments.reduce((sum,p)=>sum+(decimalCents(p.valor_pagamento)??0),0)!==order.totalCents){
  return 'Informe os meios de pagamento e confira a soma com o total do pedido.';
 }
 return null;
}

export function focusProviderPath(value:unknown,base:string){
 if(typeof value!=='string'||value.length>1800||!value)return null;
 try{
  const url=new URL(value,base);
  return url.origin===base&&!url.username&&!url.password&&url.pathname.length>1?url.pathname+url.search:null;
 }catch{return null;}
}

export function focusNfeSnapshot(data:Record<string,unknown>,base:string){
 const invoiceKey=String(data.chave_nfe??'').replace(/^NFe/,'');
 const status=data.status==='autorizado'&&/^[0-9]{44}$/.test(invoiceKey)?'authorized':
  data.status==='processando_autorizacao'?'processing':data.status==='cancelado'?'cancelled':
  data.status==='erro_autorizacao'||data.status==='denegado'?'rejected':null;
 return status?{
  status,invoice_key:status==='authorized'?invoiceKey:undefined,
  xml_path:focusProviderPath(data.caminho_xml_nota_fiscal,base)??undefined,
  danfe_path:focusProviderPath(data.caminho_danfe,base)??undefined,
  cancellation_xml_path:focusProviderPath(data.caminho_xml_cancelamento,base)??undefined,
  provider_message:String(data.mensagem_sefaz??data.mensagem??'').slice(0,500)||null,
 }:null;
}

export function focusSubmissionResult(status:number,data:Record<string,unknown>,base:string){
 const snapshot=focusNfeSnapshot(data,base);
 if(snapshot)return snapshot;
 return [400,422].includes(status)?{
  status:'rejected',provider_message:String(data.mensagem??'O emissor recusou os dados fiscais.').slice(0,500),
 }:null;
}
