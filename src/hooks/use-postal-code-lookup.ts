'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {onlyDigits} from '@/components/forms/masked-fields';

export type PostalAddress={
 postal_code:string;street:string;district:string;city:string;
 state_code:string;source:'ViaCEP'|'BrasilAPI';
};
export function usePostalCodeLookup(){
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [result,setResult]=useState<PostalAddress|null>(null);
 const pending=useRef<AbortController|null>(null);
 const reset=useCallback(()=>{
  pending.current?.abort();pending.current=null;
  setResult(null);setError('');setLoading(false);
 },[]);
 const lookup=useCallback(async(rawZip:string)=>{
  const zip=onlyDigits(rawZip,8);
  if(zip.length!==8){
   setError('Digite um CEP completo com 8 números.');
   return;
  }
  pending.current?.abort();
  const controller=new AbortController();
  pending.current=controller;
  setLoading(true);setError('');setResult(null);
  try{
   const response=await fetch('/api/postal-code/'+zip,{
    signal:controller.signal,cache:'no-store'
   });
   const body=await response.json();
   if(!response.ok)throw new Error(body.error||'Falha na consulta de CEP.');
   if(!controller.signal.aborted)setResult(body as PostalAddress);
  }catch(e){
   if(!controller.signal.aborted)setError(
    e instanceof Error?e.message:'CEP não localizado. Preencha o endereço manualmente.'
   );
  }finally{
   if(pending.current===controller){
    pending.current=null;setLoading(false);
   }
  }
 },[]);
 useEffect(()=>()=>pending.current?.abort(),[]);
 return {loading,error,result,lookup,reset};
}
