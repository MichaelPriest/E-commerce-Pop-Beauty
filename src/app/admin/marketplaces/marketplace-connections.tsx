'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {Link2,RefreshCw,ShieldCheck,PackageSearch,ShoppingBag,
 Unplug,ExternalLink,AlertTriangle} from 'lucide-react';
import {classifyMarketplaceSku,type SkuCandidate} from '@/lib/marketplaces/sku-match-core';

export type MarketplaceAccountRow={
 id:string;channel:'shopee'|'mercadolivre';external_account_id:string;
 display_name:string;status:string;token_expires_at:string|null;
 last_synced_at:string|null;last_error:string|null;
};
export type MarketplaceImportRow={
 id:string;connection_id:string;kind:'listing'|'order';
 external_id:string;title:string;sku:string;external_status:string;
 amount_cents:number|null;quantity:number|null;updated_at:string;
};
const labels={shopee:'Shopee',mercadolivre:'Mercado Livre'};
export function MarketplaceConnections({
 accounts,imports,configured,vaultReady,localSkus
}:{
 accounts:MarketplaceAccountRow[];imports:MarketplaceImportRow[];
 configured:{shopee:boolean;mercadolivre:boolean};vaultReady:boolean;
 localSkus:SkuCandidate[];
}){
 const router=useRouter();
 const [busy,setBusy]=useState(''),[message,setMessage]=useState(''),
  [error,setError]=useState('');
 async function operation(id:string,task:'listing'|'order'|'disconnect'){
  if(busy)return;
  if(task==='disconnect'&&!window.confirm(
   'Desconectar esta conta? Os tokens locais serão apagados; a autorização externa deve ser revogada também no marketplace.'))return;
  setBusy(id+task);setMessage('');setError('');
  try{
   const response=await fetch(task==='disconnect'?
    '/api/admin/marketplaces/disconnect':'/api/admin/marketplaces/sync',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(task==='disconnect'?{connection_id:id}:
     {connection_id:id,kind:task}),cache:'no-store'
   });
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||'Operação indisponível.');
   setMessage(result.message||'Operação concluída.');
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Erro ao acessar o marketplace.');}
  finally{setBusy('');}
 }
 const status=(channel:'shopee'|'mercadolivre')=>
  accounts.filter(a=>a.channel===channel&&a.status==='connected').length;
 return <section className="pope-marketplace-api">
  <h2><Link2 size={21}/> Integrações com as contas vendedoras</h2>
  <p>Conecte a Shopee e o Mercado Livre por autorização oficial. Os tokens são cifrados no servidor,
   e as consultas registram apenas anúncios e números de pedidos, sem dados pessoais dos compradores.</p>
  <div className="pope-marketplace-provider-grid">
   {(['shopee','mercadolivre'] as const).map(channel=><div key={channel}
    className="pope-marketplace-provider">
    <h3>{channel==='shopee'?'🟠':'🟡'} {labels[channel]}</h3>
    <small>{status(channel)} conta(s) conectada(s)</small>
    <p>{!vaultReady?'Cofre de credenciais não configurado.':
     !configured[channel]?'Credenciais da aplicação ausentes no servidor.':
     'Aplicação configurada para iniciar o OAuth da conta vendedora.'}</p>
    {vaultReady&&configured[channel]?
     <a className="admin-primary" href={'/api/admin/marketplaces/oauth/start/'+channel}>
      <Link2 size={16}/> Conectar conta</a>:
     <span className="ops-tag status-pending">Configuração necessária</span>}
   </div>)}
  </div>
  {!vaultReady?<p className="pope-marketplace-warning"><AlertTriangle size={16}/>
   É necessário configurar MARKETPLACE_TOKEN_ENCRYPTION_KEY no servidor. Nenhuma credencial é armazenada em texto claro.</p>:null}
  {error?<p role="alert" className="form-error">{error}</p>:null}
  {message?<p role="status" className="form-success">{message}</p>:null}
  <h3>Contas autorizadas</h3>
  <div className="ops-table-scroll"><table className="ops-table">
   <thead><tr><th>Canal / Conta</th><th>Identificação</th><th>Status</th>
    <th>Última consulta</th><th>Ações somente leitura</th></tr></thead>
   <tbody>{accounts.map(a=><tr key={a.id}>
    <td><strong>{labels[a.channel]}</strong><small>{a.display_name}</small></td>
    <td>{a.external_account_id}</td>
    <td><span className="ops-tag">{a.status==='connected'?'Conectada':
     a.status==='disconnected'?'Desconectada':'Reautorizar'}</span></td>
    <td>{a.last_synced_at?new Date(a.last_synced_at).toLocaleString('pt-BR'):'—'}</td>
    <td><div className="pope-marketplace-actions">
     <button type="button" className="admin-outline"
      disabled={!!busy||a.status!=='connected'}
      onClick={()=>operation(a.id,'listing')}>
      <PackageSearch size={15}/>{busy===a.id+'listing'?'Consultando...':'Anúncios'}</button>
     <button type="button" className="admin-outline"
      disabled={!!busy||a.status!=='connected'}
      onClick={()=>operation(a.id,'order')}>
      <ShoppingBag size={15}/>{busy===a.id+'order'?'Consultando...':'Pedidos'}</button>
     <button type="button" className="admin-outline"
      disabled={!!busy||a.status==='disconnected'}
      onClick={()=>operation(a.id,'disconnect')}>
      <Unplug size={15}/> Desconectar</button>
    </div></td>
   </tr>)}</tbody>
  </table>
  {accounts.length===0?<p className="admin-help">Nenhuma conta autorizada.
   Configure os aplicativos externos e use Conectar conta para iniciar a autorização.</p>:null}</div>
  <h3><RefreshCw size={18}/> Dados importados para conferência</h3>
  <p>Esta consulta não cria pedidos internos nem atualiza preço ou estoque. IDs externos podem ser
   relacionados aos SKUs manualmente após revisar os dados.</p>
  <div className="ops-table-scroll"><table className="ops-table">
   <thead><tr><th>Canal</th><th>Tipo</th><th>ID externo</th><th>Produto / SKU</th>
    <th>Vínculo SKU</th><th>Status externo</th><th>Valor informado</th></tr></thead>
   <tbody>{imports.map(item=>{
    const account=accounts.find(a=>a.id===item.connection_id);
    return <tr key={item.id}>
     <td>{account?labels[account.channel]:'Marketplace'}</td>
     <td>{item.kind==='order'?'Pedido':'Anúncio'}</td>
     <td>{item.external_id}</td>
     <td>{item.title||'—'}<small>{item.sku||''}</small></td>
     <td>{item.kind==='listing'?({
      matched:'SKU localizado',missing:'SKU externo ausente',
      unmatched:'Sem correspondência',ambiguous:'SKU duplicado',
      adult_blocked:'Produto +18 bloqueado'
     }[classifyMarketplaceSku(item.sku,localSkus)]):'—'}</td>
     <td>{item.external_status||'—'}</td>
     <td>{item.amount_cents!=null?
      new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})
       .format(item.amount_cents/100):'Não informado'}</td>
    </tr>;
   })}</tbody>
  </table>
  {imports.length===0?<p className="admin-help">Nenhuma consulta concluída. Após conectar,
   use Anúncios ou Pedidos para buscar a primeira página da API.</p>:null}</div>
  <p className="pope-marketplace-footer"><ShieldCheck size={16}/>
   Sincronização somente leitura. Sem criação de pedidos, baixa de estoque,
   atualização de preço, geração de etiquetas ou envio de dados para os marketplaces.
   <Link href="https://developers.mercadolivre.com.br" target="_blank" rel="noopener noreferrer">
    Documentação Mercado Livre <ExternalLink size={13}/></Link></p>
 </section>;
}
