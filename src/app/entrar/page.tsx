'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LockKeyhole, Mail, UserRound, Heart } from 'lucide-react';
import {passwordIssue} from '@/lib/password-policy';
import { createClient } from '@/lib/supabase/browser';
import { isSupabaseConfigured } from '@/lib/supabase/config';
export default function AuthPage() {
 const [mode,setMode]=useState<'login'|'signup'>('login');
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [working,setWorking]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const router=useRouter(), configured=isSupabaseConfigured();
 async function submit(e:FormEvent<HTMLFormElement>) {
  e.preventDefault();setNotice('');setError('');
  if(!configured) {setError('Autenticação ainda não configurada.');return;}
  if(password.length<8){setError('A senha deve ter pelo menos 8 caracteres.');return;}
  if(mode==='signup'){
   const issue=passwordIssue(password);
   if(issue){setError(issue);return;}
  }
  setWorking(true);
  try {
    const supabase=createClient();
    if(mode==='signup'){
      if(name.trim().length<2){setError('Informe seu nome.');return;}
      const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name:name.trim()},emailRedirectTo:window.location.origin+'/auth/callback'}});
      if(error)throw error;
      if(data.session){router.push('/conta');router.refresh();}
      else setNotice('Cadastro recebido! Verifique seu e-mail para confirmar a conta (se a confirmação estiver ativada).');
    } else {
      const {error}=await supabase.auth.signInWithPassword({email,password});
      if(error)throw error;
      router.push('/conta');router.refresh();
    }
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível concluir a autenticação.');}
  finally{setWorking(false);}
 }
 return <section className="auth-background"><div className="auth-panel"><div className="auth-decoration">💗 <span>✨</span></div>
 <div className="section-kicker">SEU ESPAÇO DE BELEZA</div><h1>{mode==='login'?'Que bom ter você aqui!':'Junte-se à Popê!'} <Heart size={23} fill="#ff459e" color="#ff459e"/></h1><p>{mode==='login'?'Entre na sua conta para acompanhar as novidades.':'Crie sua conta para acompanhar seus pedidos quando a loja abrir.'}</p>
 <div className="auth-tabs"><button className={mode==='login'?'selected':''} onClick={()=>{setMode('login');setError('');setNotice('');}}>Entrar</button><button className={mode==='signup'?'selected':''} onClick={()=>{setMode('signup');setError('');setNotice('');}}>Criar conta</button></div>
 {!configured?<p className="demo-alert">O cadastro ficará disponível após a configuração do Supabase Auth.</p>:null}
 <form onSubmit={submit}>{mode==='signup'?<label><span>Nome completo</span><span className="input-wrap"><UserRound size={19}/><input required minLength={2} value={name} onChange={e=>setName(e.target.value)} placeholder="Seu nome"/></span></label>:null}
 <label><span>E-mail</span><span className="input-wrap"><Mail size={19}/><input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@exemplo.com"/></span></label>
 <label><span>Senha</span><span className="input-wrap"><LockKeyhole size={19}/><input type="password" required minLength={mode==='login'?8:12} autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==='login'?'Sua senha':'12+ caracteres, letras, número e símbolo'}/></span></label>
 {mode==='login'?<Link href="/esqueci-senha" className="recovery-forgot-link">Esqueceu sua senha?</Link>:null}
 {error?<p role="alert" className="form-error">{error}</p>:null}{notice?<p role="status" className="form-success">{notice}</p>:null}
 <button type="submit" className="add-button auth-submit" disabled={working||!configured}>{working?'Processando...':mode==='login'?'Entrar na minha conta':'Cadastrar'}</button></form>
 <Link href="/" className="auth-return">← Voltar para a loja</Link></div></section>;
}
