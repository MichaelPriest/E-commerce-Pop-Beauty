'use client';
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {createClient} from '@/lib/supabase/browser';
import {isSupabaseConfigured} from '@/lib/supabase/config';

export function StorefrontSession({userId}:{userId:string|null}){
 const router=useRouter();
 useEffect(()=>{
  if(!isSupabaseConfigured())return;
  const auth=createClient().auth;
  let current=userId,active=true;
  function check(id:string|null){
   if(active&&id!==current){current=id;router.refresh();}
  }
  const {data}=auth.onAuthStateChange((event,session)=>{
   if(event==='SIGNED_IN'||event==='SIGNED_OUT'||event==='INITIAL_SESSION'){
    check(session&&!session.user.is_anonymous?session.user.id:null);
   }
  });
  // A saída feita por uma ação do servidor também altera os cookies das outras abas.
  function onFocus(){
   if(document.visibilityState!=='visible')return;
   void auth.getSession().then(({data:{session}})=>{
    check(session&&!session.user.is_anonymous?session.user.id:null);
   }).catch(()=>{});
  }
  window.addEventListener('focus',onFocus);
  document.addEventListener('visibilitychange',onFocus);
  return ()=>{
   active=false;
   data.subscription.unsubscribe();
   window.removeEventListener('focus',onFocus);
   document.removeEventListener('visibilitychange',onFocus);
  };
 },[router,userId]);
 return null;
}
