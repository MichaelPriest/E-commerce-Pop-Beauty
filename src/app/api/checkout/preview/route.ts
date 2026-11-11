import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {isSupabaseConfigured} from '@/lib/supabase/config';
import type {CheckoutPreview} from '@/lib/checkout-preview';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(request:NextRequest){
 const noStore={'Cache-Control':'no-store, private, max-age=0'};
 const origin=request.headers.get('origin');
 if(!origin){
  return NextResponse.json({error:'Origem obrigatória.'},{status:403,headers:noStore});
 }
 let originHost:string;
 try{originHost=new URL(origin).host;}catch{
  return NextResponse.json({error:'Origem inválida.'},{status:403,headers:noStore});
 }
 if(originHost!==new URL(request.url).host){
  return NextResponse.json({error:'Origem não autorizada.'},{status:403,headers:noStore});
 }
 if(!isSupabaseConfigured()){
  return NextResponse.json({error:'Catálogo indisponível para conferência.'},{status:503,headers:noStore});
 }
 let body:unknown;
 try{body=await request.json();}catch{
  return NextResponse.json({error:'Formato da solicitação inválido.'},{status:400,headers:noStore});
 }
 if(!body||typeof body!=='object'||!('items' in body)||
  !Array.isArray((body as {items:unknown}).items)){
  return NextResponse.json({error:'Carrinho inválido.'},{status:400,headers:noStore});
 }
 const items=(body as {items:unknown[]}).items;
 if(items.length<1||items.length>30){
  return NextResponse.json({error:'Carrinho deve ter de 1 a 30 itens.'},{status:400,headers:noStore});
 }
 const normalized=[];
 const seen=new Set<string>();
 for(const item of items){
  if(!item||typeof item!=='object')return NextResponse.json(
   {error:'Há um item inválido no carrinho.'},{status:400,headers:noStore});
  const row=item as {product_id?:unknown;quantity?:unknown};
  if(typeof row.product_id!=='string'||row.product_id.length<1||row.product_id.length>80||
    !Number.isInteger(row.quantity)||Number(row.quantity)<1||Number(row.quantity)>99){
   return NextResponse.json({error:'Identificador ou quantidade inválidos.'},{status:400,headers:noStore});
  }
  if(seen.has(row.product_id))return NextResponse.json(
   {error:'Há produtos repetidos no carrinho. Ajuste as quantidades.'},{status:400,headers:noStore});
  seen.add(row.product_id);
  normalized.push({product_id:row.product_id,quantity:row.quantity});
 }
 try{
  const sb=await createClient();
  const {data,error}=await sb.rpc('preview_checkout_cart',{p_items:normalized});
  if(error){
   return NextResponse.json({error:'Não foi possível conferir o carrinho. Tente novamente.'},
    {status:503,headers:noStore});
  }
  const quote=data as CheckoutPreview;
  if(!quote||quote.preview_only!==true||quote.payment_available!==false||
     quote.stock_reserved!==false||!Array.isArray(quote.lines)){
   return NextResponse.json({error:'Resposta de conferência inválida.'},{status:503,headers:noStore});
  }
  return NextResponse.json(quote,{headers:noStore});
 }catch{
  return NextResponse.json({error:'Não foi possível consultar o catálogo agora.'},
   {status:503,headers:noStore});
 }
}
