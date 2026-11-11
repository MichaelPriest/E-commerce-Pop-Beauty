import {NextRequest,NextResponse} from 'next/server';
import {marketplaceAdminSession,marketplaceAccessToken,
 type MarketplaceAccount} from '@/lib/marketplaces/session';
import {readMarketplacePage} from '@/lib/marketplaces/read-only';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const noStore={'Cache-Control':'private, no-store, max-age=0'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(message:string,status:number)=>NextResponse.json({error:message},{status,headers:noStore});

export async function POST(request:NextRequest){
 const origin=request.headers.get('origin');
 let host='';
 try{host=origin?new URL(origin).host:'';}catch{}
 if(!host||host!==new URL(request.url).host)return fail('Origem não autorizada.',403);
 const sb=await marketplaceAdminSession();
 if(!sb)return fail('Acesso administrativo necessário.',403);
 if(!request.headers.get('content-type')?.includes('application/json'))return fail('JSON obrigatório.',415);
 let input:unknown;
 try{input=await request.json();}catch{return fail('Solicitação inválida.',400);}
 if(!input||typeof input!=='object')return fail('Solicitação inválida.',400);
 const payload=input as Record<string,unknown>;
 const accountId=payload.connection_id,kind=payload.kind;
 const cursor=payload.cursor;
 if(typeof accountId!=='string'||!uuid.test(accountId)||
  (kind!=='listing'&&kind!=='order')||
  (cursor!==undefined&&
   (typeof cursor!=='string'||cursor.length>1000)))
  return fail('Conta, tipo ou cursor de sincronização inválido.',400);
 const {data:account,error}=await sb.from('marketplace_connections')
  .select('id,channel,external_account_id,display_name,status,token_expires_at,last_synced_at,last_error')
  .eq('id',accountId).maybeSingle();
 if(error||!account||account.status!=='connected')return fail('Conta não conectada.',409);
 try{
  const token=await marketplaceAccessToken(sb,account as MarketplaceAccount);
  const page=await readMarketplacePage(account.channel,account.external_account_id,
   token,kind,typeof cursor==='string'?cursor:undefined);
  const rows=page.rows;
  if(rows.length>30)throw new Error('Limite de sincronização excedido.');
  if(kind==='order'&&page.orders?.length){
   const {error:linesError}=await sb.rpc('replace_marketplace_order_line_previews',{
    p_connection_id:accountId,p_orders:page.orders
   });
   if(linesError)throw new Error('Não foi possível gravar as linhas sanitizadas dos pedidos.');
  }
  if(rows.length){
   const {error:saveError}=await sb.from('marketplace_readonly_imports')
    .upsert(rows.map(row=>({...row,connection_id:accountId,
     updated_at:new Date().toISOString()})),
     {onConflict:'connection_id,kind,external_id'});
   if(saveError)throw new Error('Não foi possível gravar a prévia de marketplace.');
  }
  const {error:markError}=await sb.rpc('record_marketplace_sync',{p_id:accountId});
  if(markError)throw new Error('Não foi possível registrar a conferência.');
  return NextResponse.json({success:true,imported:rows.length,kind,
   next_cursor:page.nextCursor,
   order_lines:page.orders?.reduce((sum,order)=>sum+order.lines.length,0)??0,
   message:'Página consultada ('+rows.length+' registros). Nenhum pedido, preço ou estoque comercial foi alterado.'},
   {headers:noStore});
 }catch(e){
  return fail(e instanceof Error?e.message:'Falha ao consultar marketplace.',502);
 }
}
