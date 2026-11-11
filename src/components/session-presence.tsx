'use client';
import {useEffect} from 'react';
import {createClient} from '@/lib/supabase/browser';

/**
 * Atividade aproximada: sem IP, localização, histórico de páginas nem coleta de cliques.
 * A sessão é identificada por claims JWT validadas pelo Supabase, nunca por um ID fornecido pelo cliente.
 */
export function SessionPresence(){
 useEffect(()=>{
  const supabase=createClient();
  let lastPing=0;
  let stopped=false;
  const ping=async(force=false)=>{
   if(stopped||document.visibilityState==='hidden')return;
   const now=Date.now();
   if(!force&&now-lastPing<45000)return;
   lastPing=now;
   try{await supabase.rpc('touch_user_session_presence');}
   catch{ /* Presença é auxiliar; não pode impedir a navegação. */ }
  };
  const onFocus=()=>{void ping();};
  const onVisibility=()=>{if(document.visibilityState==='visible')void ping();};
  void ping(true);
  const interval=window.setInterval(()=>{void ping();},65000);
  window.addEventListener('focus',onFocus);
  document.addEventListener('visibilitychange',onVisibility);
  return ()=>{
   stopped=true;window.clearInterval(interval);
   window.removeEventListener('focus',onFocus);
   document.removeEventListener('visibilitychange',onVisibility);
  };
 },[]);
 return null;
}
