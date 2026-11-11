'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {ShieldCheck} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
type Props={userId:string;status:'pending'|'approved'|'rejected'|null};
export function AgeRequest({userId,status}:Props){
 const [submitting,setSubmitting]=useState(false),[error,setError]=useState('');
 const router=useRouter();
 if(status==='pending')return <div className="adult-request-status">Sua solicitação de verificação está pendente de análise. O conteúdo permanece bloqueado.</div>;
 if(status==='approved')return <div className="adult-request-status">Sua verificação anterior expirou ou está indisponível. Fale com o atendimento para uma nova verificação.</div>;
 if(status==='rejected')return <div className="adult-request-status">Não foi possível confirmar a maioridade. Entre em contato com o atendimento para uma nova análise.</div>;
 async function request(){
  if(submitting)return;
  setSubmitting(true);setError('');
  try{
   const supabase=createClient();
   const {error:insertError}=await supabase.from('age_verification_requests').insert({user_id:userId});
   if(insertError)throw insertError;
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível solicitar verificação.');}
  finally{setSubmitting(false);}
 }
 return <div className="adult-request"><p>Solicite uma análise de maioridade. Um responsável autorizado precisará conferir uma prova de idade por procedimento seguro, sem guardar fotos ou documentos no catálogo.</p>
  <button className="hero-button" onClick={request} disabled={submitting}><ShieldCheck size={18}/>{submitting?'Enviando...':'Solicitar verificação de maioridade'}</button>
  {error?<p className="form-error" role="alert">{error}</p>:null}
 </div>;
}
