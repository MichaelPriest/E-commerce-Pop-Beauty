'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {ShieldCheck,ShieldAlert,Settings,LockKeyhole,CheckCircle2,XCircle,RefreshCcw,ExternalLink,ToggleLeft,ToggleRight} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
type RequestItem={
 user_id:string;status:string;requested_at:string;reviewed_at:string|null;
 display_name:string;verified_at:string|null;expires_at:string|null;
};
type Props={enabled:boolean;requests:RequestItem[]};
export function SettingsManager({enabled,requests}:Props){
 const router=useRouter(),[current,setCurrent]=useState(enabled);
 const [saving,setSaving]=useState(false),[busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const [checked,setChecked]=useState<Record<string,boolean>>({});
 const pending=requests.filter(r=>r.status==='pending');
 async function toggle(){
  if(saving)return;
  setSaving(true);setError('');setNotice('');
  try{
   const {error}=await createClient().from('store_settings').update({adult_enabled:!current}).eq('id',1);
   if(error)throw error;
   setCurrent(!current);
   setNotice(!current?'Módulo habilitado. A visualização continua bloqueada para quem não possui maioridade verificada.':'Módulo desativado: catálogo e imagens adultos bloqueados para clientes.');
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Falha ao alterar configuração.');}
  finally{setSaving(false);}
 }
 async function review(userId:string,approved:boolean){
  if(busy)return;
  if(approved&&!checked[userId]){setError('Antes de aprovar, confirme que conferiu uma prova confiável de maioridade fora da aplicação.');return;}
  setBusy(userId);setError('');setNotice('');
  try{
   const {error}=await createClient().rpc('review_age_verification',{p_user_id:userId,p_approved:approved,p_method:'manual_document'});
   if(error)throw error;
   setNotice(approved?'Maioridade registrada após conferência manual.':'Solicitação rejeitada e acesso negado.');
   setChecked(v=>({...v,[userId]:false}));router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Erro ao revisar solicitação.');}
  finally{setBusy(null);}
 }
 async function reopen(userId:string){
  if(busy)return;setBusy(userId);setError('');setNotice('');
  try{
   const {error}=await createClient().from('age_verification_requests')
    .update({status:'pending',reviewed_at:null,reviewed_by:null}).eq('user_id',userId);
   if(error)throw error;
   setNotice('Solicitação reaberta para nova revisão.');router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Falha ao reabrir.');}
  finally{setBusy(null);}
 }
 const time=(raw:string|null)=>raw?new Date(raw).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}):'—';
 return <div className="container admin-workspace settings-workspace">
  <div className="admin-top"><div><div className="section-kicker">CONFIGURAÇÕES • POPÊ BEAUTY</div><h1>Configurações da loja ⚙️</h1><p>Controle recursos sensíveis e gerencie verificações de maioridade.</p></div></div>
  {error?<p className="form-error" role="alert">{error}</p>:null}{notice?<p className="form-success" role="status">{notice}</p>:null}
  <section className="settings-card">
   <div className="settings-card-head"><div className="settings-icon"><LockKeyhole size={25}/></div><div><h2>Módulo Sex Shop +18</h2><p>Produtos adultos ficam completamente separados da vitrine comum.</p></div></div>
   <div className="settings-switch-row"><div><strong>Disponibilizar a seção +18</strong><small>{current?'Ativada — somente clientes com maioridade comprovada terão acesso.':'Desativada — nenhum cliente pode acessar produtos ou imagens adultos.'}</small></div>
    <button type="button" role="switch" aria-checked={current} aria-label="Ativar ou desativar seção adulta" className={'settings-switch '+(current?'on':'')} onClick={toggle} disabled={saving}>
     {current?<ToggleRight size={39}/>:<ToggleLeft size={39}/>} {saving?'Salvando...':current?'Ativada':'Desativada'}
    </button>
   </div>
   <div className="settings-tip"><ShieldCheck size={18}/><span>Proteção em duas camadas: configuração administrativa e maioridade verificada pelo banco. Apenas informar a data de nascimento ou marcar “tenho 18 anos” não libera o conteúdo.</span></div>
   <p className="settings-disclaimer">O botão controla a disponibilidade técnica. Para oferecer produtos restritos, organize um procedimento de aferição de idade confiável, documentado e compatível com as orientações da ANPD. O sistema não valida documentos automaticamente.</p>
  </section>
  <section className="settings-card">
   <div className="settings-card-head"><div className="settings-icon"><ShieldCheck size={25}/></div><div><h2>Verificações de maioridade</h2><p>Solicitações recentes: {requests.length} · Aguardando análise: {pending.length}</p></div></div>
   <p className="settings-disclaimer"><strong>Para aprovar:</strong> confira uma prova de maioridade e titularidade em procedimento confiável, confirme que se trata da conta correta e não armazene imagem do documento aqui. A aprovação não pode se basear somente em autodeclaração, selfie estimada ou nome de perfil.</p>
   <div className="settings-request-list">{requests.length?requests.map(r=><article className="settings-request" key={r.user_id}>
    <div className="settings-request-heading"><div><strong>{r.display_name}</strong><small>Identificador: <code>{r.user_id}</code></small><small>Solicitação: {time(r.requested_at)}</small></div><span className={'admin-status '+(r.status==='approved'?'live':r.status==='pending'?'warning':'draft')}>{r.status==='approved'?'Aprovada':r.status==='rejected'?'Rejeitada':'Pendente'}</span></div>
    {r.expires_at?<p className="settings-expiry">Maioridade verificada até {time(r.expires_at)}.</p>:null}
    {r.status==='pending'?<div className="settings-review"><label className="settings-check"><input type="checkbox" checked={!!checked[r.user_id]} onChange={e=>setChecked(v=>({...v,[r.user_id]:e.target.checked}))}/><span>Confirmei pessoalmente uma prova confiável de maioridade e a correspondência com esta conta.</span></label>
      <div className="settings-actions"><button className="admin-primary" disabled={busy!==null||!checked[r.user_id]} onClick={()=>review(r.user_id,true)}><CheckCircle2 size={17}/> Aprovar +18</button><button className="admin-outline" disabled={busy!==null} onClick={()=>review(r.user_id,false)}><XCircle size={17}/> Rejeitar</button></div></div>:
      <button type="button" className="admin-outline" disabled={busy!==null} onClick={()=>reopen(r.user_id)}><RefreshCcw size={15}/> Reabrir solicitação</button>}
   </article>):<div className="admin-empty"><ShieldAlert size={33}/><h3>Nenhuma solicitação</h3><p>Os clientes poderão solicitar verificação quando o módulo estiver habilitado.</p></div>}</div>
  </section>
  <section className="settings-card">
   <div className="settings-card-head"><div className="settings-icon"><Settings size={25}/></div><div><h2>Segurança de senhas</h2><p>Proteção contra senhas conhecidas de vazamentos</p></div></div>
   <p>O Supabase atualmente está no plano Free. A checagem de senhas vazadas do Have I Been Pwned exige o plano Pro ou superior. Não alterei seu plano nem gerei cobranças.</p>
   <div className="settings-tip"><ShieldAlert size={18}/><span>Recomendação: configure o mínimo de 12 caracteres e a exigência de letras maiúsculas, minúsculas, números e símbolos nas configurações de autenticação do Supabase.</span></div>
   <a className="admin-outline" target="_blank" rel="noreferrer" href="https://supabase.com/dashboard/project/igdmkymzxdrqjkwouunc/auth/providers?provider=Email"><ExternalLink size={16}/> Abrir segurança de senhas no Supabase</a>
  </section>
 </div>;
}
