'use client';

import {useEffect,useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import {
 Search,CheckCircle2,AlertCircle,KeyRound,ExternalLink,Save,
 FlaskConical,SlidersHorizontal,ShieldCheck,Info,RefreshCcw,
 CreditCard,Star,LockKeyhole,ClipboardCheck
} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {
 PAYMENT_GATEWAYS,type PaymentGatewayDefinition,type PaymentGatewayId,
 type PaymentGatewaySetting
} from '@/lib/payment-gateways';
import type {GatewayEnvironment} from '@/lib/payment-gateways-server';
import {dateTimeBR} from '@/types/operations';

type AuditItem={id:string;provider:string;event:string;created_at:string};
type TestResult={provider:string;result:string;message:string};
type Props={
 initialRows:PaymentGatewaySetting[];
 environments:GatewayEnvironment[];
 history:AuditItem[];
};
const sectionLabels:{[key:string]:string}={
 'Carteira e intermediador':'Carteira / intermediador',
 'Intermediador':'Intermediador',
 'PSP e gateway':'PSP / gateway',
 'Gestão de recebíveis':'Cobranças e recebíveis',
 'Plataforma de pagamentos':'Plataforma',
 'Pix e cobranças':'Pix e cobranças',
 'Pagamentos globais':'Internacional',
 'Adquirência':'Adquirência',
 'Gestão de cobrança':'Cobranças',
 'Checkout e links':'Checkout hospedado'
};

function ProviderCard({provider,row,env,save,check,busy,testResult}:{
 provider:PaymentGatewayDefinition;
 row:PaymentGatewaySetting;
 env:GatewayEnvironment;
 save:(provider:PaymentGatewayId,params:{included:boolean;preferred:boolean;notes:string})=>Promise<void>;
 check:(provider:PaymentGatewayId)=>Promise<void>;
 busy:string|null;
 testResult:TestResult|undefined;
}){
 const [included,setIncluded]=useState(row.included_in_evaluation);
 const [preferred,setPreferred]=useState(row.preferred_for_sandbox);
 const [notes,setNotes]=useState(row.notes);
 useEffect(()=>{
  setIncluded(row.included_in_evaluation);
  setPreferred(row.preferred_for_sandbox);
  setNotes(row.notes);
 },[row.included_in_evaluation,row.preferred_for_sandbox,row.notes]);
 const changed=included!==row.included_in_evaluation||
  preferred!==row.preferred_for_sandbox||notes!==row.notes;
 const isBusy=busy!==null;
 const configured=env.configured;
 const hasSandbox=provider.sandbox==='available';
 return <article className={'pope-gateway-card'+(row.preferred_for_sandbox?' preferred':'')}>
  <div className="pope-gateway-card-head">
   <div className="pope-gateway-logo"><CreditCard size={25}/></div>
   <div className="pope-gateway-title">
    <h3>{provider.name}</h3>
    <small>{sectionLabels[provider.category]??provider.category}</small>
   </div>
   {row.preferred_for_sandbox?<span className="pope-gateway-preference">
    <Star size={13}/> Candidato
   </span>:null}
  </div>
  <p className="pope-gateway-description">{provider.summary}</p>
  <div className="pope-gateway-capabilities">
   {provider.methods.map(method=><span key={method}>{method}</span>)}
  </div>
  <div className="pope-gateway-integration">
   <span>Integração prevista</span><strong>{provider.integration}</strong>
  </div>
  <div className="pope-gateway-status-grid">
   <div>
    <small>Ambiente de homologação</small>
    <strong className={hasSandbox?'pope-gateway-ok':'pope-gateway-caution'}>
     {hasSandbox?'Sandbox disponível':provider.sandbox==='none'?'Sem sandbox':'Verificar ambiente'}
    </strong>
   </div>
   <div>
    <small>Credenciais no servidor</small>
    <strong className={configured?'pope-gateway-ok':'pope-gateway-muted'}>
     {provider.envKeys.length===0?'Não aplicável':configured?'Variáveis presentes':'Ainda não configuradas'}
    </strong>
   </div>
  </div>
  {provider.sandbox==='none'?<p className="pope-gateway-alert">
   <AlertCircle size={16}/> Este provedor não tem sandbox. Para evitar cobranças reais, a Popê Beauty não fará chamadas de teste à API.
  </p>:null}
  <div className="pope-gateway-env">
   <strong><KeyRound size={14}/> Variáveis da Vercel</strong>
   {provider.envKeys.length===0?
    <small>Não adicione uma chave de produção nesta etapa.</small>:
    <div className="pope-gateway-key-list">
     {provider.envKeys.map(key=><code key={key} className={env.missingKeys.includes(key)?'missing':'present'}>
      {key}{env.missingKeys.includes(key)?' · pendente':' · presente'}</code>)}
    </div>}
   <small>Nunca cole tokens nem senhas no campo de observações.</small>
  </div>
  <div className="pope-gateway-actions">
   <a href={provider.docs} target="_blank" rel="noopener noreferrer"
    className="admin-outline"><ExternalLink size={15}/> Documentação</a>
   <button className="admin-outline" type="button"
    disabled={isBusy||!env.supportsReadOnlyTest||!configured||!hasSandbox}
    title={!env.supportsReadOnlyTest?'Teste automatizado de conexão não disponível':'Consulta segura, sem cobrança'}
    onClick={()=>check(provider.id)}>
    {busy==='test:'+provider.id?<RefreshCcw size={15}/>:<FlaskConical size={15}/>}
    {busy==='test:'+provider.id?'Consultando...':'Testar conexão'}
   </button>
  </div>
  {testResult?<p role="status" className={'pope-gateway-check '+(testResult.result==='connected'?'passed':'failed')}>
   {testResult.result==='connected'?<CheckCircle2 size={16}/>:<Info size={16}/>}
   {testResult.message}
  </p>:null}
  <div className="pope-gateway-compare">
   <label className="settings-check">
    <input type="checkbox" checked={included} disabled={isBusy}
     onChange={e=>{
      setIncluded(e.target.checked);
      if(!e.target.checked)setPreferred(false);
     }}/>
    <span>Manter na comparação</span>
   </label>
   <label className="settings-check">
    <input type="checkbox" checked={preferred} disabled={isBusy||!included||provider.sandbox==='none'}
     onChange={e=>setPreferred(e.target.checked)}/>
    <span>Escolher como candidato de homologação</span>
   </label>
   <label className="pope-gateway-note-label">
    Observações e condições comerciais
    <textarea value={notes} disabled={isBusy} maxLength={500} rows={2}
     onChange={e=>setNotes(e.target.value)}
     placeholder="Ex.: taxas cotadas, prazo de recebimento, observações (sem tokens)..."/>
   </label>
   <div className="pope-gateway-save-row">
    <small>{changed?'Alterações ainda não salvas':'Preferências administrativas salvas'}</small>
    <button type="button" className="admin-primary" disabled={isBusy||!changed}
     onClick={()=>save(provider.id,{included,preferred,notes})}>
     <Save size={15}/>{busy==='save:'+provider.id?'Salvando...':'Salvar'}
    </button>
   </div>
  </div>
 </article>;
}

export function GatewayManager({initialRows,environments,history}:Props){
 const router=useRouter();
 const [rows,setRows]=useState(initialRows);
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('todos');
 const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [testResults,setTestResults]=useState<Record<string,TestResult>>({});
 useEffect(()=>setRows(initialRows),[initialRows]);
 const byId=new Map(rows.map(row=>[row.provider,row]));
 const envById=new Map(environments.map(env=>[env.provider,env]));
 const shown=useMemo(()=>PAYMENT_GATEWAYS.filter(provider=>{
  const row=rows.find(r=>r.provider===provider.id);
  const env=environments.find(e=>e.provider===provider.id);
  if(!row||!env)return false;
  if(filter==='included'&&!row.included_in_evaluation)return false;
  if(filter==='configured'&&!env.configured)return false;
  if(filter==='missing'&&(env.configured||provider.envKeys.length===0))return false;
  if(filter==='candidate'&&!row.preferred_for_sandbox)return false;
  return [provider.name,provider.category,provider.integration,...provider.methods]
   .join(' ').toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'));
 }),[query,filter,rows,environments]);
 const chosen=rows.find(x=>x.preferred_for_sandbox);
 async function save(provider:PaymentGatewayId,params:{included:boolean;preferred:boolean;notes:string}){
  if(busy)return;setBusy('save:'+provider);setError('');setNotice('');
  try{
   const {error:rpcError}=await createClient().rpc('save_gateway_evaluation',{
    p_provider:provider,p_included:params.included,p_preferred:params.preferred,p_notes:params.notes
   });
   if(rpcError)throw rpcError;
   setRows(old=>old.map(row=>({
    ...row,
    included_in_evaluation:row.provider===provider?params.included:row.included_in_evaluation,
    preferred_for_sandbox:row.provider===provider?params.preferred:(params.preferred?false:row.preferred_for_sandbox),
    notes:row.provider===provider?params.notes:row.notes
   })));
   setNotice('Preferências de '+PAYMENT_GATEWAYS.find(p=>p.id===provider)?.name+' salvas. O checkout permanece desativado.');
   router.refresh();
  }catch(e){
   setError(e instanceof Error?e.message:'Não foi possível salvar a configuração.');
  }finally{setBusy(null);}
 }
 async function check(provider:PaymentGatewayId){
  if(busy)return;setBusy('test:'+provider);setError('');setNotice('');
  try{
   const response=await fetch('/api/admin/gateways/test',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({provider})
   });
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||'Falha ao consultar API de sandbox');
   setTestResults(old=>({...old,[provider]:result}));
  }catch(e){
   setError(e instanceof Error?e.message:'Não foi possível concluir a consulta.');
  }finally{setBusy(null);}
 }
 return <div className="pope-gateway-page">
  <div className="pope-gateway-intro">
   <div><span className="pope-gateway-section-kicker"><SlidersHorizontal size={17}/> COMPARAÇÃO E HOMOLOGAÇÃO</span>
    <h2>Escolha com liberdade, ative somente quando estiver pronto</h2>
    <p>Compare todos os provedores cadastrados. O candidato é apenas uma preferência interna de testes; não é o gateway oficial da loja.</p>
   </div>
   <div className="pope-gateway-choice">
    <small>Candidato atual</small><strong>{chosen?PAYMENT_GATEWAYS.find(g=>g.id===chosen.provider)?.name:'Não selecionado'}</strong>
    <span>Sem cobranças reais</span>
   </div>
  </div>
  <div className="admin-filterbar">
   <label className="admin-search"><Search size={18}/><input
    value={query} onChange={e=>setQuery(e.target.value)}
    placeholder="Pesquisar por gateway, integração ou método..."/></label>
   <select value={filter} onChange={e=>setFilter(e.target.value)}>
    <option value="todos">Todos os gateways</option>
    <option value="included">Na comparação</option>
    <option value="configured">Com variáveis presentes</option>
    <option value="missing">Aguardando credenciais</option>
    <option value="candidate">Candidato selecionado</option>
   </select>
   <span className="pope-admin-filter-count">{shown.length} opções</span>
  </div>
  {error?<p className="form-error" role="alert">{error}</p>:null}
  {notice?<p className="form-success" role="status">{notice}</p>:null}
  <div className="pope-gateway-grid">
   {shown.map(provider=>{
    const row=byId.get(provider.id);
    const env=envById.get(provider.id);
    return row&&env?<ProviderCard key={provider.id} provider={provider} row={row} env={env}
     save={save} check={check} busy={busy} testResult={testResults[provider.id]}/>:null;
   })}
  </div>
  {shown.length===0?<div className="admin-empty"><Search size={33}/>
   <h3>Nenhuma opção corresponde ao filtro</h3>
   <p>Altere a busca para visualizar todos os gateways.</p>
  </div>:null}
  <section className="pope-gateway-next">
   <h2><ClipboardCheck size={20}/> Para liberar um gateway posteriormente</h2>
   <div className="pope-gateway-next-grid">
    <div><strong>1. Credenciais de teste</strong><p>Insira as variáveis indicadas em <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer">Vercel → Settings → Environment Variables</a>. Jamais utilize credenciais de produção nesta etapa.</p></div>
    <div><strong>2. Homologação e webhooks</strong><p>Testar a API e depois implementar o checkout, webhook autenticado, idempotência, conciliação e cancelamentos antes de processar pedidos reais.</p></div>
    <div><strong>3. Escolha comercial</strong><p>Compare taxas, prazo de recebimento, parcelamento, Pix, chargeback e suporte. Só então selecione um gateway para produção.</p></div>
   </div>
  </section>
  <section className="pope-gateway-audit">
   <h2><ShieldCheck size={19}/> Histórico de preferências</h2>
   {history.length?<div className="ops-table-scroll"><table className="ops-table">
    <thead><tr><th>Quando</th><th>Gateway</th><th>Alteração</th></tr></thead>
    <tbody>{history.map(item=><tr key={item.id}>
     <td>{dateTimeBR(item.created_at)}</td>
     <td>{PAYMENT_GATEWAYS.find(g=>g.id===item.provider)?.name??item.provider}</td>
     <td>{item.event==='sandbox_candidate_changed'?'Candidato de homologação':'Inclusão na avaliação'}</td>
    </tr>)}</tbody>
   </table></div>:
   <p>Sem modificações registradas. As preferências iniciais são apenas opções disponíveis para comparação.</p>}
  </section>
 </div>;
}
