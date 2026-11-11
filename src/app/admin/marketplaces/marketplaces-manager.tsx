'use client';
import {useMemo,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {Link2,Search,RefreshCw,ShieldAlert,Store,Box,Save} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import type {SellableSku,ListingRow} from '@/types/operations';
type Props={links:ListingRow[];variants:SellableSku[]};
const channels=[{id:'shopee',label:'Shopee',symbol:'🟠'},{id:'mercadolivre',label:'Mercado Livre',symbol:'🟡'}];
export function MarketplacesManager({links,variants}:Props){
 const router=useRouter(),[channel,setChannel]=useState('shopee'),[sku,setSku]=useState(''),[listingId,setListingId]=useState('');
 const [query,setQuery]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const eligible=useMemo(()=>variants.filter(v=>v.products&&!v.products.is_adult),[variants]);
 const shown=useMemo(()=>links.filter(l=>[l.external_listing_id,l.variants?.sku,l.variants?.products?.name,l.channel].join(' ').toLowerCase().includes(query.toLowerCase())),[links,query]);
 async function link(e:FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');setNotice('');
  try{
   if(!sku||listingId.trim().length<2)throw new Error('Selecione o SKU e informe o código externo do anúncio.');
   const {error:rpcError}=await createClient().rpc('link_marketplace_listing',{
    p_variant_id:sku,p_channel:channel,p_external_listing_id:listingId.trim()
   });
   if(rpcError)throw rpcError;
   setSku('');setListingId('');setNotice('Referência salva. A sincronização de preços, pedidos e estoque NÃO foi ativada.');router.refresh();
  }catch(err){setError(err instanceof Error?err.message:'Não foi possível vincular o anúncio.');}
  finally{setBusy(false);}
 }
 return <div className="container admin-workspace">
  <div className="admin-top"><div><div className="section-kicker">CANAIS DE VENDA • POPÊ BEAUTY</div><h1>Marketplaces 🛒</h1><p>Vincule os SKUs da loja a anúncios externos, preparando a futura integração.</p></div></div>
  <div className="ops-integration-grid">{channels.map(c=><div className="ops-integration" key={c.id}><div className="ops-integration-icon">{c.symbol}</div><h2>{c.label}</h2><p>API não conectada</p><span className="ops-tag status-pending">Sem sincronização</span><small>{links.filter(l=>l.channel===c.id).length} SKU(s) vinculados</small></div>)}
   <div className="ops-integration"><div className="ops-integration-icon">💳</div><h2>Pagamentos</h2><p>Gateway não configurado</p><span className="ops-tag status-pending">Checkout desativado</span><small>Sem cobranças automáticas</small></div>
  </div>
  <p className="ops-info"><ShieldAlert size={18}/> Os vínculos cadastrados nesta tela são apenas identificadores. A Popê NÃO acessa sua conta Shopee ou Mercado Livre, NÃO importa pedidos e NÃO sincroniza estoques nesta etapa. Produtos +18 não podem ser vinculados aqui.</p>
  <section className="ops-form-card"><h2><Link2 size={20}/> Vincular anúncio existente</h2>
   <form onSubmit={link} className="ops-link-form">
    <label>Marketplace<select value={channel} onChange={e=>setChannel(e.target.value)}>
     {channels.map(c=><option value={c.id} key={c.id}>{c.label}</option>)}</select></label>
    <label>SKU da Popê<select value={sku} onChange={e=>setSku(e.target.value)} required><option value="">Selecionar SKU...</option>
     {eligible.map(v=><option value={v.id} key={v.id}>{v.sku} — {v.products?.name}</option>)}</select></label>
    <label>ID externo do anúncio<input value={listingId} onChange={e=>setListingId(e.target.value)} minLength={2} maxLength={100} required placeholder="ID do anúncio no marketplace"/></label>
    <button className="admin-primary" type="submit" disabled={busy}><Save size={16}/>{busy?'Salvando...':'Salvar vínculo'}</button>
   </form>{error?<p role="alert" className="form-error">{error}</p>:null}
   {notice?<p role="status" className="form-success">{notice}</p>:null}
  </section>
  <section className="ops-form-card"><h2><Box size={19}/> Anúncios vinculados</h2>
   <div className="admin-filterbar"><label className="admin-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar anúncio ou SKU"/></label></div>
   <div className="ops-table-scroll"><table className="ops-table"><thead><tr><th>Canal</th><th>Produto</th><th>SKU</th><th>ID do anúncio</th><th>Situação</th></tr></thead>
    <tbody>{shown.map(l=><tr key={l.id}><td>{l.channel==='shopee'?'🟠 Shopee':'🟡 Mercado Livre'}</td>
     <td>{l.variants?.products?.name??'Produto não encontrado'}</td><td><strong>{l.variants?.sku??'—'}</strong></td><td>{l.external_listing_id}</td>
     <td><span className="ops-tag status-pending">Vinculado · sem sincronização</span></td></tr>)}</tbody></table>
    {shown.length===0?<div className="admin-empty"><Store size={32}/><h3>Nenhum vínculo cadastrado</h3><p>Os anúncios serão listados aqui após o cadastro manual de seus IDs.</p></div>:null}
   </div>
  </section>
 </div>;
}
