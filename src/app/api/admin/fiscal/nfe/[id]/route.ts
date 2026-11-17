import {NextRequest,NextResponse} from 'next/server';
import {orderResponse,orderService,orderSession,orderUuid,privateHeaders} from '@/lib/order-request';
import {focusConfig,focusRequest,loadFocusOrder} from '@/lib/fiscal/focus-nfe';
import {decimalCents,focusDraft,focusNfeSnapshot,focusPayloadIssue,focusProviderPath,focusSubmissionResult} from '@/lib/fiscal/focus-nfe-core';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Route={params:Promise<{id:string}>};

export async function GET(request:NextRequest,{params}:Route){
 const {id}=await params;
 const config=focusConfig(),service=orderService();
 if(!config||!service)return orderResponse({error:'Emissor fiscal aguardando configuração.'},503);
 const session=await orderSession(request,true);
 if(session.error)return session.error;
 const kind=request.nextUrl.searchParams.get('document');
 if(!orderUuid.test(id)||!['xml','danfe','cancelamento'].includes(kind??''))return orderResponse({error:'Documento inválido.'},400);
 const {data}=await service.from('store_nfe_documents').select('status,xml_path,danfe_path,cancellation_xml_path')
  .eq('order_id',id).eq('environment',config.environment).maybeSingle();
 const path=focusProviderPath(kind==='danfe'?data?.danfe_path:kind==='xml'?data?.xml_path:data?.cancellation_xml_path,config.base);
 if(!path||!data||!['authorized','cancelled'].includes(data.status))return orderResponse({error:'Documento ainda indisponível.'},404);
 try{
  const file=await focusRequest(config,path);
  if(!file.ok||Number(file.headers.get('content-length'))>10_000_000)throw new Error();
  const bytes=await file.arrayBuffer();
  const mime=kind==='danfe'?'application/pdf':'application/xml';
  if(bytes.byteLength>10_000_000||!bytes.byteLength||
     (kind==='danfe'&&Buffer.from(bytes.slice(0,5)).toString()!=='%PDF-')||
     (kind!=='danfe'&&!(file.headers.get('content-type')??'').toLowerCase().includes('xml')&&
      !Buffer.from(bytes.slice(0,300)).toString().trimStart().startsWith('<?xml')))throw new Error();
  return new NextResponse(bytes,{headers:{...privateHeaders,'Content-Type':mime,'X-Content-Type-Options':'nosniff',
   'Content-Disposition':`attachment; filename="pope-${kind}-${id.slice(0,8)}.${kind==='danfe'?'pdf':'xml'}"`}});
 }catch{return orderResponse({error:'O emissor não disponibilizou o arquivo.'},502);}
}

export async function POST(request:NextRequest,{params}:Route){
 const {id}=await params;
 const service=orderService(),config=focusConfig();
 const session=await orderSession(request,true);
 if(session.error)return session.error;
 if(!orderUuid.test(id))return orderResponse({error:'Pedido inválido.'},400);
 const body=await request.json().catch(()=>null);
 if(!body||typeof body!=='object')return orderResponse({error:'Dados inválidos.'},400);
 if(body.action==='draft'||body.action==='submit'){
  let order;
  try{order=await loadFocusOrder(session.sb,id);}
  catch(e){return orderResponse({error:e instanceof Error?e.message:'Dados fiscais pendentes.'},409);}
  if(body.action==='draft')return orderResponse({payload:focusDraft(order)});
  if(!config||!service)return orderResponse({error:'Emissor fiscal aguardando configuração.'},503);
  const payload=body.payload;
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||JSON.stringify(payload).length>160000)
   return orderResponse({error:'O documento fiscal deve ser um objeto JSON válido.'},400);
  const issue=focusPayloadIssue(payload,order);
  if(issue)return orderResponse({error:issue},400);
  payload.data_emissao=new Date().toISOString();
  const {data:reference,error}=await service.rpc('claim_store_nfe',{
   p_order_id:id,p_environment:config.environment,p_total_cents:order.totalCents,p_payload:payload,
  });
  if(error||!reference)return orderResponse({error:error?.code==='P0001'?error.message:'Há uma NF-e registrada. Consulte sua situação.'},409);
  try{
   const response=await focusRequest(config,'/v2/nfe?ref='+reference,'POST',payload);
   const raw=await response.json().catch(()=>({}));
   const snap=focusSubmissionResult(response.status,raw,config.base);
   if(!snap)throw new Error();
   const {error:write}=await service.from('store_nfe_documents').update({...snap,updated_at:new Date().toISOString()})
    .eq('reference',reference).eq('status','submitting');
   if(write)throw write;
   return orderResponse({message:snap.status==='rejected'?'Dados recusados. Confira a mensagem fiscal.':'Transmissão registrada. Consulte a situação fiscal.'});
  }catch{return orderResponse({error:'Envio ainda sem confirmação. Consulte a mesma referência para verificar a NF-e.'},502);}
 }
 if(!config||!service)return orderResponse({error:'Emissor fiscal aguardando configuração.'},503);
 const {data:document}=await service.from('store_nfe_documents').select('reference,status,updated_at,submitted_payload,invoice_key')
  .eq('order_id',id).eq('environment',config.environment).maybeSingle();
 if(!document)return orderResponse({error:'Nenhuma NF-e registrada neste ambiente.'},404);
 if(body.action==='cancel'){
  const reason=typeof body.reason==='string'?body.reason.trim():'';
  if(reason.length<15||reason.length>255)return orderResponse({error:'Informe justificativa de 15 a 255 caracteres.'},400);
  const {data:reference,error}=await service.rpc('claim_store_nfe_cancel',{p_order_id:id,p_environment:config.environment});
  if(error||!reference)return orderResponse({error:error?.code==='P0001'?error.message:'A NF-e não está disponível para cancelamento.'},409);
  try{
   const response=await focusRequest(config,'/v2/nfe/'+reference,'DELETE',{justificativa:reason});
   const raw=await response.json().catch(()=>({}));
   const snap=focusNfeSnapshot(raw,config.base);
   const result=snap?.status==='cancelled'?snap:
    response.status===422||raw.status==='erro_cancelamento'?{status:'authorized',provider_message:String(raw.mensagem_sefaz??raw.mensagem??'Cancelamento recusado.').slice(0,500)}:null;
   if(!result)throw new Error();
   const {error:write}=await service.from('store_nfe_documents').update({...result,updated_at:new Date().toISOString()})
    .eq('reference',reference).eq('status','cancelling');
   if(write)throw write;
   return orderResponse({message:result.status==='cancelled'?'Cancelamento confirmado pelo emissor.':'Confira a mensagem de cancelamento.'});
  }catch{return orderResponse({error:'Cancelamento ainda sem confirmação. Consulte a situação fiscal.'},502);}
 }
 if(!['status','retry'].includes(body.action))return orderResponse({error:'Operação inválida.'},400);
 try{
  const response=await focusRequest(config,'/v2/nfe/'+document.reference);
  if(response.status===404&&body.action==='retry'&&document.status==='submitting'){
   const {data:claimed,error}=await service.rpc('claim_store_nfe',{p_order_id:id,p_environment:config.environment,
    p_total_cents:decimalCents(document.submitted_payload.valor_total),p_retry_reference:document.reference,p_payload:document.submitted_payload});
   if(error||!claimed)return orderResponse({error:error?.code==='P0001'?error.message:'Aguarde a confirmação de envio e consulte novamente.'},409);
   const retry=await focusRequest(config,'/v2/nfe?ref='+document.reference,'POST',document.submitted_payload);
   const raw=await retry.json().catch(()=>({}));
   const snap=focusSubmissionResult(retry.status,raw,config.base);
   if(!snap)throw new Error();
   const {error:write}=await service.from('store_nfe_documents').update({...snap,updated_at:new Date().toISOString()})
    .eq('reference',document.reference).eq('status','submitting');
   if(write)throw write;
   return orderResponse({message:'A mesma referência foi consultada e atualizada.'});
  }
  if(!response.ok)throw new Error();
  const snap=focusNfeSnapshot(await response.json(),config.base);
  if(!snap)throw new Error();
  if(document.status==='cancelled'&&snap.status!=='cancelled')return orderResponse({message:'NF-e cancelada.'});
  if(document.status==='cancelling'&&snap.status==='authorized')return orderResponse({message:'O emissor ainda informa a NF-e autorizada. Confira o cancelamento no portal.'});
  if(document.invoice_key&&!['authorized','cancelled'].includes(snap.status))throw new Error();
  const {error}=await service.from('store_nfe_documents').update({...snap,updated_at:new Date().toISOString()})
   .eq('reference',document.reference).eq('updated_at',document.updated_at);
  if(error)throw error;
  return orderResponse({message:'Situação fiscal consultada.'});
 }catch{return orderResponse({error:'Não foi possível confirmar a situação com o emissor.'},502);}
}
