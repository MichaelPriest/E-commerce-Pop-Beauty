'use client';
import {useEffect} from 'react';
import {createClient} from '@/lib/supabase/browser';
import {cartStore} from '@/lib/storefront-lists';
import {cartSnapshot,cartSnapshotKey,type CartSnapshotLine} from '@/lib/cart-recovery-core';

/** Save only authenticated carts. Anonymous browser carts stay local.
 * Never replace a local cart with server data silently.
 */
export function CartCloudSync({userId}:{userId:string|null}){
 useEffect(()=>{
  if(!userId)return;
  const sb=createClient();
  let live=true,unsubscribe:(()=>void)|null=null;
  let pending:ReturnType<typeof setTimeout>|null=null;
  let previousKey='';
  async function boot(){
   const {data,error}=await sb.from('customer_saved_carts')
    .select('items').eq('user_id',userId).maybeSingle();
   if(!live)return;
   if(error)return;
   const saved=(data?.items??[]) as CartSnapshotLine[];
   const initial=cartSnapshot(cartStore.getSnapshot());
   previousKey=cartSnapshotKey(initial);
   // O carrinho de outro dispositivo só pode ser restaurado por ação explícita.
   if(initial.length&&previousKey!==cartSnapshotKey(saved)){
    await sb.rpc('save_customer_cart',{p_items:initial});
   }
   if(!live)return;
   const changed=()=>{
    const next=cartSnapshot(cartStore.getSnapshot());
    const key=cartSnapshotKey(next);
    if(key===previousKey)return;
    previousKey=key;
    if(pending)clearTimeout(pending);
    pending=setTimeout(()=>{
     if(!live)return;
     void sb.rpc('save_customer_cart',{p_items:next});
    },1100);
   };
   unsubscribe=cartStore.subscribe(changed);
   changed();
  }
  void boot();
  return ()=>{
   live=false;unsubscribe?.();
   if(pending)clearTimeout(pending);
  };
 },[userId]);
 return null;
}
