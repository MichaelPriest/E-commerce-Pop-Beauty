'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {BookmarkCheck,RefreshCw,ShieldCheck,Trash2} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {cartStore} from '@/lib/storefront-lists';
import {cartSnapshot,cartSnapshotKey,type CartSnapshotLine} from '@/lib/cart-recovery-core';
import type {CartItem} from '@/lib/cart-core';

type Saved={items:CartSnapshotLine[];reminders_opt_in:boolean;last_activity_at:string};
type ProductRow={id:string;slug:string;name:string;price_cents:number;image_url:string|null;active:boolean;is_adult:boolean};
type VariantRow={id:string;product_id:string;sku:string;name:string;shade:string|null;active:boolean};

export function SavedCartPanel(){
 const [signed,setSigned]=useState(false),[saved,setSaved]=useState<Saved|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[info,setInfo]=useState('');
 useEffect(()=>{
  let live=true;
  void (async()=>{
   const sb=createClient();
   const {data}=await sb.auth.getClaims();
   if(!live||!data?.claims?.sub||data.claims.is_anonymous===true)return;
   setSigned(true);
   const {data:row}=await sb.from('customer_saved_carts')
    .select('items,reminders_opt_in,last_activity_at')
    .eq('user_id',data.claims.sub).maybeSingle();
   if(live)setSaved(row as Saved|null);
  })();
  return ()=>{live=false;};
 },[]);
 async function toggleReminder(){
  if(busy)return;setBusy(true);setError('');setInfo('');
  const next=!saved?.reminders_opt_in;
  const {error:dbError}=await createClient().rpc('set_saved_cart_reminders',{p_enabled:next});
  if(dbError)setError('Não foi possível atualizar a preferência.');
  else{setSaved(old=>({items:old?.items??[],last_activity_at:old?.last_activity_at??new Date().toISOString(),
   reminders_opt_in:next}));setInfo('Preferência atualizada. Nenhuma mensagem foi enviada.');}
  setBusy(false);
 }
 async function restore(){
  if(!saved?.items?.length||busy)return;
  const local=cartSnapshot(cartStore.getSnapshot());
  if(cartSnapshotKey(local)===cartSnapshotKey(saved.items)){
   setInfo('Os itens já estão no carrinho deste navegador.');return;
  }
  if(local.length&&!window.confirm('Substituir os itens do carrinho atual pelos itens salvos na conta?'))return;
  setBusy(true);setError('');setInfo('');
  try{
   const sb=createClient();
   const productIds=[...new Set(saved.items.map(i=>i.product_id))];
   const variantIds=[...new Set(saved.items.flatMap(i=>i.variant_id?[i.variant_id]:[]))];
   const [{data:products,error:productError},variantResult]=await Promise.all([
    sb.from('products').select('id,slug,name,price_cents,image_url,active,is_adult')
     .in('id',productIds),
    variantIds.length?sb.from('variants').select('id,product_id,sku,name,shade,active')
     .in('id',variantIds):Promise.resolve({data:[],error:null})
   ]);
   if(productError||variantResult.error)throw new Error('Não foi possível carregar os produtos salvos.');
   const byProduct=new Map(((products??[]) as ProductRow[]).map(p=>[p.id,p]));
   const byVariant=new Map(((variantResult.data??[]) as VariantRow[]).map(v=>[v.id,v]));
   const items:CartItem[]=saved.items.flatMap(line=>{
    const p=byProduct.get(line.product_id);
    if(!p||!p.active||p.is_adult)return [];
    const variant=line.variant_id?byVariant.get(line.variant_id):null;
    if(line.variant_id&&(!variant||!variant.active||variant.product_id!==p.id))return [];
    return [{id:p.id,slug:p.slug,name:p.name,price_cents:p.price_cents,
     qty:line.quantity,image_url:p.image_url??undefined,
     ...(variant?{variant_id:variant.id,variant_name:variant.shade||variant.name,
      sku:variant.sku}:{})}];
   });
   if(!items.length)throw new Error('Os produtos salvos não estão disponíveis para restauração.');
   cartStore.write(items);
   setInfo(items.length+' item(ns) restaurado(s). Preços e estoque serão verificados no checkout.');
  }catch(e){setError(e instanceof Error?e.message:'Falha ao restaurar carrinho.');}
  finally{setBusy(false);}
 }
 async function clearSaved(){
  if(busy||!window.confirm('Esvaziar o carrinho deste navegador e apagar os itens salvos na conta?'))return;
  setBusy(true);setError('');
  const {error:dbError}=await createClient().rpc('save_customer_cart',{p_items:[]});
  if(dbError)setError('Não foi possível limpar o carrinho salvo.');
  else{cartStore.write([]);
   setSaved(old=>old?{...old,items:[],last_activity_at:new Date().toISOString()}:old);
   setInfo('Carrinho e itens salvos apagados.');}
  setBusy(false);
 }
 if(!signed)return null;
 const count=(saved?.items??[]).reduce((s,i)=>s+i.quantity,0);
 return <section className="pope-saved-cart-panel" aria-label="Carrinho salvo na conta">
  <h2><BookmarkCheck size={21}/> Carrinho salvo na sua conta</h2>
  <p>Quando você está conectado, a Popê salva as escolhas deste navegador para
   que possam ser recuperadas depois. Carrinhos sem atividade podem aparecer
   à equipe na central de recuperação. <Link href="/conta">Sua conta</Link>.</p>
  <p><strong>{count} {count===1?'unidade salva':'unidades salvas'}</strong>
   {saved?.items.length?' · Você pode restaurá-las neste navegador.':''}</p>
  <div className="pope-saved-cart-actions">
   {count>0?<button className="admin-primary" type="button" disabled={busy}
    onClick={restore}><RefreshCw size={16}/> Restaurar carrinho salvo</button>:null}
   {count>0?<button className="admin-outline" type="button" disabled={busy}
    onClick={clearSaved}><Trash2 size={16}/> Esvaziar carrinho e conta</button>:null}
  </div>
  <label className="pope-saved-cart-consent">
   <input type="checkbox" checked={saved?.reminders_opt_in??false}
    disabled={busy} onChange={()=>void toggleReminder()}/>
   Autorizo o recebimento de lembretes sobre carrinhos não finalizados.
  </label>
  <p className="pope-saved-cart-disclosure"><ShieldCheck size={15}/>
   A autorização pode ser retirada aqui. O sistema ainda não envia lembretes automáticos.
   O valor apresentado no carrinho é apenas uma prévia.</p>
  {error?<p role="alert" className="form-error">{error}</p>:null}
  {info?<p role="status" className="form-success">{info}</p>:null}
 </section>;
}
