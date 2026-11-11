'use client';
import {useEffect,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {ArrowLeft,CheckCircle2,Eye,EyeOff,KeyRound,LockKeyhole,ShieldCheck} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {passwordIssue} from '@/lib/password-policy';

type Stage='checking'|'ready'|'invalid'|'success';
export function ResetPasswordForm(){
 const [stage,setStage]=useState<Stage>('checking');
 const [password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
 const [visible,setVisible]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  let live=true;
  const supabase=createClient();
  // getUser verifica a sessão criptograficamente no servidor Auth.
  // Apenas quem trocou um code de recuperação ou já possui uma sessão válida chega à atualização.
  supabase.auth.getUser().then(({data,error:authError})=>{
   if(live)setStage(!authError&&data.user?'ready':'invalid');
  }).catch(()=>{if(live)setStage('invalid')});
  return ()=>{live=false};
 },[]);
 async function update(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(stage!=='ready'||saving)return;
  setError('');
  const issue=passwordIssue(password);
  if(issue){setError(issue);return;}
  if(password!==confirm){setError('As senhas digitadas não são iguais.');return;}
  setSaving(true);
  try{
   const supabase=createClient();
   const {data:userData,error:userError}=await supabase.auth.getUser();
   if(userError||!userData.user){setStage('invalid');return;}
   const {error:updateError}=await supabase.auth.updateUser({password});
   if(updateError)throw updateError;
   // Não manter a sessão de recuperação como sessão de navegação.
   await supabase.auth.signOut();
   setPassword('');setConfirm('');setStage('success');
  }catch(err){
   setError(err instanceof Error?err.message:'Não foi possível redefinir a senha. Peça um novo link.');
  }finally{setSaving(false);}
 }
 return <section className="auth-background"><div className="auth-panel recovery-panel">
  <div className="auth-decoration">💗 <span>🔐</span></div>
  <div className="section-kicker">RECUPERAÇÃO DE ACESSO</div>
  {stage==='checking'?<><h1>Validando seu acesso…</h1>
   <p>Estamos verificando o link de recuperação de forma segura.</p></>:
  stage==='invalid'?<><LockKeyhole size={40} className="recovery-error-icon"/>
   <h1>Link inválido ou expirado</h1>
   <p>Não foi possível confirmar uma sessão válida de recuperação. Solicite um novo link pelo e-mail cadastrado.</p>
   <Link href="/esqueci-senha" className="add-button auth-submit recovery-action-link">Solicitar novo link</Link>
  </>:
  stage==='success'?<><CheckCircle2 size={45} className="recovery-success-icon"/>
   <h1>Senha atualizada!</h1>
   <p>Sua nova senha foi salva com sucesso. Por segurança, faça login novamente.</p>
   <Link href="/entrar" className="add-button auth-submit recovery-action-link">Entrar com a nova senha</Link>
  </>:
  <><h1>Crie uma nova senha <KeyRound size={24}/></h1>
   <p>Escolha uma senha forte e diferente das que você já utilizou.</p>
   <form onSubmit={update}>
    <label><span>Nova senha</span><span className="input-wrap">
     <LockKeyhole size={19}/>
     <input type={visible?'text':'password'} required autoComplete="new-password"
      minLength={12} maxLength={72} value={password} onChange={e=>setPassword(e.target.value)}
      placeholder="12+ caracteres, número e símbolo" disabled={saving}/>
     <button type="button" className="recovery-visibility" aria-label={visible?'Ocultar senha':'Mostrar senha'}
      onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button>
    </span></label>
    <label><span>Confirme sua nova senha</span><span className="input-wrap">
     <ShieldCheck size={19}/>
     <input type={visible?'text':'password'} required autoComplete="new-password"
      minLength={12} maxLength={72} value={confirm} onChange={e=>setConfirm(e.target.value)}
      placeholder="Digite novamente sua senha" disabled={saving}/>
    </span></label>
    <p className="recovery-password-rule">Requisitos: 12 a 72 caracteres, letra maiúscula, minúscula, número e símbolo.</p>
    {error?<p className="form-error" role="alert">{error}</p>:null}
    <button type="submit" className="add-button auth-submit" disabled={saving}>
     {saving?'Salvando senha...':'Salvar nova senha'}
    </button>
   </form>
  </>}
  <Link href="/entrar" className="auth-return"><ArrowLeft size={16}/> Voltar ao login</Link>
 </div></section>;
}
