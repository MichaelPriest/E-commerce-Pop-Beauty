'use client';
import {useEffect,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {ArrowLeft,CheckCircle2,Heart,Mail,ShieldCheck} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {isSupabaseConfigured} from '@/lib/supabase/config';

export default function ForgotPasswordPage(){
 const [email,setEmail]=useState('');
 const [sending,setSending]=useState(false),[sent,setSent]=useState(false),[error,setError]=useState('');
 const configured=isSupabaseConfigured();
 useEffect(()=>{
  if(new URLSearchParams(window.location.search).get('erro')==='link')
   setError('O link de recuperação é inválido, expirou ou já foi utilizado. Solicite outro.');
 },[]);
 async function send(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(sending||sent)return;
  setError('');
  if(!configured){setError('Recuperação temporariamente indisponível.');return;}
  const address=email.trim().toLowerCase();
  if(!address||address.length>254){setError('Informe um endereço de e-mail válido.');return;}
  setSending(true);
  try{
   const supabase=createClient();
   // O retorno para a loja precisa estar nas Redirect URLs permitidas no Supabase.
   // O fluxo usa PKCE e troca o code por uma sessão no servidor.
   const redirectTo=window.location.origin+'/auth/callback?next=/redefinir-senha';
   const {error:requestError}=await supabase.auth.resetPasswordForEmail(address,{redirectTo});
   if(requestError){
    if(requestError.status===429||requestError.code==='over_email_send_rate_limit'){
     setError('Muitas solicitações de recuperação. Aguarde alguns minutos e tente novamente.');
    }else{
     setError('Não foi possível enviar a solicitação neste momento. Tente novamente mais tarde.');
    }
    return;
   }
   // Mensagem deliberadamente genérica: não revelar se o endereço está cadastrado.
   setSent(true);
  }catch{
   setError('Não foi possível solicitar a recuperação agora. Verifique a conexão e tente novamente.');
  }finally{
   setSending(false);
  }
 }
 return <section className="auth-background"><div className="auth-panel recovery-panel">
  <div className="auth-decoration">💗 <span>✨</span></div>
  <div className="section-kicker">SEGURANÇA DA CONTA</div>
  {sent?<><CheckCircle2 className="recovery-success-icon" size={40}/>
   <h1>Confira seu e-mail</h1>
   <p>Se houver uma conta associada ao endereço informado, enviaremos um link para redefinir a senha.</p>
   <div className="recovery-tips"><ShieldCheck size={19}/>
    <span>Abra o link no mesmo navegador em que solicitou a recuperação. O link tem validade limitada e só pode ser utilizado uma vez.</span>
   </div>
   <button className="admin-outline recovery-full-button" onClick={()=>{setSent(false);setError('');}}>Solicitar novamente</button>
  </>:
  <><h1>Esqueceu sua senha? <Heart size={24}/></h1>
   <p>Informe o e-mail cadastrado. Enviaremos instruções para recuperar o acesso à Popê Beauty.</p>
   <form onSubmit={send}>
    <label><span>Seu e-mail</span>
     <span className="input-wrap"><Mail size={19}/>
      <input type="email" autoComplete="email" required maxLength={254}
       value={email} onChange={e=>setEmail(e.target.value)}
       placeholder="voce@exemplo.com" disabled={sending}/>
     </span></label>
    {error?<p className="form-error" role="alert">{error}</p>:null}
    <button className="add-button auth-submit" type="submit" disabled={!configured||sending}>
      {sending?'Enviando...':'Enviar link de recuperação'}
    </button>
   </form>
   <p className="recovery-footnote">Não tem mais acesso ao e-mail cadastrado? A recuperação automática não é possível; será necessário falar com o suporte e comprovar a titularidade da conta.</p>
  </>}
  <Link href="/entrar" className="auth-return"><ArrowLeft size={16}/> Voltar ao login</Link>
 </div></section>;
}
