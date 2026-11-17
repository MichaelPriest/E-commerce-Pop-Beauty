'use client';

import {useState} from 'react';
import {Plug,ExternalLink} from 'lucide-react';
import {PRODUCTION_ENV_URL,type PreflightCard,type PreflightProvider,type PreflightResult} from '@/lib/integration-preflight';

export function IntegrationChecks({cards}:{cards:PreflightCard[]}){
 const [running,setRunning]=useState<PreflightProvider|null>(null);
 const [results,setResults]=useState<Partial<Record<PreflightProvider,PreflightResult>>>({});

 async function verify(id:PreflightProvider){
  if(running)return;
  setRunning(id);
  try{
   const response=await fetch('/api/admin/prontidao/verify',{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error??'Consulta indisponível.');
   setResults(old=>({...old,[id]:data}));
  }catch(error){
   setResults(old=>({...old,[id]:{state:'blocked',message:error instanceof Error?error.message:'Consulta indisponível.'}}));
  }finally{setRunning(null);}
 }

 return <section className="pope-readiness-group" id="integracoes">
  <h2><Plug size={20}/> Conexão com os provedores</h2>
  <p className="pope-readiness-footnote">Cadastre os valores na Vercel, refaça o deploy e teste a consulta.</p>
  <a className="admin-outline" href={PRODUCTION_ENV_URL} target="_blank" rel="noreferrer noopener">Abrir variáveis da Vercel<ExternalLink size={15}/></a>
  <div className="pope-readiness-grid pope-preflight-grid">
   {cards.map(card=>{
    const last=results[card.id];
    return <article key={card.id} className="pope-readiness-item">
     <div className="pope-readiness-item-title"><strong>{card.title}</strong>
      <span className={'pope-readiness-status state-'+(card.missing.length?'pending':'manual')}>
       {card.missing.length?`${card.missing.length} variáve${card.missing.length===1?'l pendente':'is pendentes'}`:'Variáveis presentes'}
      </span>
     </div>
     {card.missing.length>0&&<ul className="pope-preflight-vars">{card.missing.map(key=><li key={key}><code>{key}</code></li>)}</ul>}
     <button type="button" className="admin-outline" disabled={!card.canCheck||running!==null} onClick={()=>void verify(card.id)}>
      {running===card.id?'Consultando…':'Testar consulta'}</button>
     {last&&<p role="status" className={'pope-readiness-status pope-preflight-result state-'+last.state}>{last.message}</p>}
    </article>;
   })}
  </div>
 </section>;
}
