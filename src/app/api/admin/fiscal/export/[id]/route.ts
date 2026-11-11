import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {fiscalChecklist,type FiscalIssuer,type FiscalRecipient,
 type FiscalItem,type FiscalTax} from '@/lib/fiscal/readiness-core';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const noCache={
 'Cache-Control':'private, no-store, max-age=0',
 'Pragma':'no-cache',
 'X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer'
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!uuid.test(id))return NextResponse.json({error:'Pedido inválido.'},
  {status:400,headers:noCache});
 const sb=await createClient();
 const {data:auth,error:authError}=await sb.auth.getClaims();
 if(authError||!auth?.claims?.sub)return NextResponse.json({error:'Sessão expirada.'},
  {status:401,headers:noCache});
 const {data:profile,error:profileError}=await sb.from('profiles')
  .select('role').eq('id',auth.claims.sub).maybeSingle();
 if(profileError||profile?.role!=='admin')return NextResponse.json(
  {error:'Acesso exclusivo ao administrador.'},{status:403,headers:noCache});
 const [o,issuer,draft,recipient]=await Promise.all([
  sb.from('orders').select(
   'id,origin,status,channel,created_at,total_cents,shipping_address_snapshot,order_items(id,variant_id,sku_snapshot,title_snapshot,quantity,unit_price_cents)'
  ).eq('id',id).eq('origin','admin_manual').maybeSingle(),
  sb.from('fiscal_issuer_settings').select('*').eq('id',1).maybeSingle(),
  sb.from('fiscal_order_drafts').select('fiscal_model,operation_nature,review_notes')
   .eq('order_id',id).maybeSingle(),
  sb.from('fiscal_order_recipients').select('full_name,tax_id,state_registration')
   .eq('order_id',id).maybeSingle()
 ]);
 if(o.error||!o.data)return NextResponse.json({error:'Pedido não encontrado.'},
  {status:404,headers:noCache});
 if(issuer.error||draft.error||recipient.error)return NextResponse.json(
  {error:'Não foi possível conferir dados fiscais.'},{status:503,headers:noCache});
 const lines=o.data.order_items??[];
 const variantIds=lines.map(x=>x.variant_id).filter((x):x is string=>!!x);
 const variants=variantIds.length?await sb.from('variants')
  .select('id,product_id').in('id',variantIds):{data:[],error:null};
 if(variants.error)return NextResponse.json({error:'Falha ao buscar os produtos.'},
  {status:503,headers:noCache});
 const productForVariant=new Map((variants.data??[]).map(x=>[x.id,x.product_id]));
 const ids=[...new Set((variants.data??[]).map(x=>x.product_id))];
 const details=ids.length?await sb.from('product_fiscal_details')
  .select('*').in('product_id',ids):{data:[],error:null};
 if(details.error)return NextResponse.json({error:'Falha ao conferir tributos.'},
  {status:503,headers:noCache});
 const fiscalByProduct=new Map((details.data??[]).map(x=>[x.product_id,x]));
 const items=lines.map((x,i)=>{
  const pId=productForVariant.get(x.variant_id??'')??null;
  return {index:i+1,variant_id:x.variant_id,product_id:pId,
   sku:x.sku_snapshot,description:x.title_snapshot,quantity:x.quantity,
   unit_price_cents:x.unit_price_cents,
   line_total_cents:x.quantity*x.unit_price_cents,
   fiscal_classification:pId?fiscalByProduct.get(pId)??null:null};
 });
 const prepared:FiscalItem[]=items.map(x=>({
  sku:x.sku,quantity:x.quantity,priceCents:x.unit_price_cents,
  tax:x.fiscal_classification as FiscalTax|null
 }));
 const model=draft.data?.fiscal_model==='65'?'65':'55';
 const issues=fiscalChecklist({
  issuer:issuer.data as FiscalIssuer|null,
  recipient:recipient.data as FiscalRecipient|null,
  lines:prepared,model,status:o.data.status,
  shippingAddressPresent:!!o.data.shipping_address_snapshot&&
   typeof o.data.shipping_address_snapshot==='object'&&
   'street' in o.data.shipping_address_snapshot
 });
 const body={
  format:'pope.fiscal.preparation.v1',
  is_official_document:false,
  document_status:'not_submitted',
  ready_for_transmission:false,
  mandatory_review_by_accountant:true,
  missing_basic_fields:issues,
  fiscal_model:model,
  operation_nature:draft.data?.operation_nature??null,
  notes:draft.data?.review_notes??null,
  issuer:issuer.data,
  recipient:recipient.data,
  order:{
   id:o.data.id,origin:o.data.origin,channel:o.data.channel,
   status:o.data.status,created_at:o.data.created_at,
   items_total_cents:items.reduce((sum,x)=>sum+x.line_total_cents,0),
   order_total_cents:o.data.total_cents,
   delivery_address:o.data.shipping_address_snapshot
  },
  items
 };
 // Arquivo para integração futura; não é XML padrão NF-e nem DANFE.
 return new NextResponse(JSON.stringify(body,null,2),{
  status:200,
  headers:{...noCache,
   'Content-Type':'application/json; charset=utf-8',
   'Content-Disposition':'attachment; filename="pope-fiscal-preparacao-'+id.slice(0,8)+'.json"'}
 });
}
