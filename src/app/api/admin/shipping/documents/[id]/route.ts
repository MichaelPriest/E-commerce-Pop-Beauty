import {NextResponse,type NextRequest} from 'next/server';
import {createClient as createServiceClient} from '@supabase/supabase-js';
import {createClient as createSessionClient} from '@/lib/supabase/server';
import {
 SHIPPING_PDF_BUCKET,canonicalShippingPdfPath,validateShippingPdfDocument
} from '@/lib/shipping/private-document';

export const dynamic='force-dynamic';
export const runtime='nodejs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const securityHeaders={
 'Cache-Control':'private, no-store, max-age=0',
 'Pragma':'no-cache',
 'X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer',
 'Content-Security-Policy':"sandbox"
};
const failure=(error:string,status:number)=>
 NextResponse.json({error},{status,headers:securityHeaders});

/** Entrega direta para admin, sem URL pública ou assinada.
 * Bucket e tabelas continuam sem permissão de acesso no navegador.
 */
export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!uuid.test(id))return failure('Documento inválido.',400);
 const sb=await createSessionClient();
 const {data:identity,error:authError}=await sb.auth.getClaims();
 const userId=identity?.claims?.sub;
 if(authError||typeof userId!=='string'||!uuid.test(userId))
  return failure('Faça login para visualizar documentos.',401);
 const {data:profile,error:profileError}=await sb.from('profiles')
  .select('role').eq('id',userId).maybeSingle();
 if(profileError||profile?.role!=='admin')
  return failure('Acesso restrito ao administrador.',403);

 const {data:doc,error:docError}=await sb.from('shipment_provider_documents')
  .select('id,order_id,request_id,document_type,bucket_id,object_path,sha256')
  .eq('id',id).maybeSingle();
 if(docError)return failure('Falha ao consultar o documento.',503);
 if(!doc)return failure('Documento não encontrado.',404);
 const [order,request]=await Promise.all([
  sb.from('orders').select('id,origin').eq('id',doc.order_id).maybeSingle(),
  sb.from('shipment_workflow_requests').select('id,order_id,provider')
   .eq('id',doc.request_id).maybeSingle()
 ]);
 if(order.error||request.error||order.data?.origin!=='admin_manual'||
    !request.data||request.data.order_id!==doc.order_id)
  return failure('Vínculo do documento inválido.',409);
 const expected=canonicalShippingPdfPath(doc.id,doc.order_id,doc.request_id);
 if(doc.bucket_id!==SHIPPING_PDF_BUCKET||!expected||doc.object_path!==expected)
  return failure('Caminho privado inválido.',409);

 // Não usar esta chave no cliente; habilitar somente ao homologar o adaptador.
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
 if(!key||!url)return failure(
  'Consulta a documentos oficiais ainda desativada no servidor.',503
 );
 const service=createServiceClient(url,key,{
  auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}
 });
 const {data:blob,error:downloadError}=await service.storage
  .from(SHIPPING_PDF_BUCKET).download(doc.object_path);
 if(downloadError||!blob)return failure('PDF indisponível no armazenamento privado.',404);
 const bytes=new Uint8Array(await blob.arrayBuffer());
 if(!validateShippingPdfDocument({
  documentId:doc.id,orderId:doc.order_id,requestId:doc.request_id,
  objectPath:doc.object_path,bucketId:doc.bucket_id,
  expectedSha256:doc.sha256,bytes
 }))return failure('Integridade do PDF não confirmada. Download bloqueado.',409);
 // O acesso só é fornecido após persistir uma linha de auditoria.
 const {error:auditError}=await service.from('shipment_document_access_events')
  .insert({
   document_id:doc.id,order_id:doc.order_id,
   admin_user_id:userId,action:'download',object_sha256:doc.sha256
  });
 if(auditError)return failure('Não foi possível registrar a auditoria de acesso.',503);
 const fileLabel=doc.document_type==='official_label'?'etiqueta':
  doc.document_type==='posting_receipt'?'comprovante':'manifesto';
 const downloadName='pope-'+fileLabel+'-'+id.slice(0,8)+'.pdf';
 return new NextResponse(bytes,{
  status:200,
  headers:{
   ...securityHeaders,'Content-Type':'application/pdf',
   'Content-Length':String(bytes.byteLength),
   'Content-Disposition':`attachment; filename="${downloadName}"`
  }
 });
}
