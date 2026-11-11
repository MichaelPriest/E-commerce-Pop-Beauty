'use client';
import {useMemo,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {ArrowDown,ArrowUp,Boxes,CalendarClock,PackageSearch,Search,ShieldAlert,Truck,Warehouse, X, Clock, CheckCircle2} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import type {StockVariant,LotRow} from '@/types/admin';
type Props={variants:StockVariant[]};
const isoToday=()=>new Date().toISOString().slice(0,10);
const expiresSoon=(date:string|null)=>date!==null&&date<=new Date(Date.now()+60*86400000).toISOString().slice(0,10);
function statusFor(v:StockVariant){
 const on=v.inventory?.on_hand??0, reserved=v.inventory?.reserved??0, minimum=v.inventory?.safety_stock??0;
 const validLots=(v.inventory_lots??[]).filter(l=>l.on_hand>0);
 if(validLots.some(l=>l.expires_at&&l.expires_at<isoToday()))return 'vencido';
 if(validLots.some(l=>expiresSoon(l.expires_at)))return 'vencendo';
 if(on-reserved<=minimum)return 'baixo';
 return 'ok';
}
function readableDate(value:string|null){if(!value)return 'Sem validade';const [y,m,d]=value.split('-');return [d,m,y].join('/');}
export function StockManager({variants}:Props){
 const router=useRouter(),[query,setQuery]=useState(''),[filter,setFilter]=useState('todos');
 const [selected,setSelected]=useState<StockVariant|null>(null),[direction,setDirection]=useState<'in'|'out'>('in');
 const [amount,setAmount]=useState('1'),[reason,setReason]=useState('Entrada de mercadorias');
 const [lotCode,setLotCode]=useState('SEM-LOTE'),[expiry,setExpiry]=useState('');
 const [saving,setSaving]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const metrics=useMemo(()=>{
  const all=variants.length,units=variants.reduce((a,v)=>a+(v.inventory?.on_hand??0),0),
    low=variants.filter(v=>statusFor(v)==='baixo').length,
    expiring=variants.filter(v=>statusFor(v)==='vencendo').length,
    expired=variants.filter(v=>statusFor(v)==='vencido').length;
  return {all,units,low,expiring,expired};
 },[variants]);
 const visible=useMemo(()=>variants.filter(v=>{
  const s=[v.sku,v.name,v.shade,v.products?.name,v.products?.brand].join(' ').toLocaleLowerCase('pt-BR');
  return (!query||s.includes(query.toLocaleLowerCase('pt-BR')))&&(filter==='todos'||statusFor(v)===filter);
 }),[query,filter,variants]);
 function start(v:StockVariant,type:'in'|'out'){
  setSelected(v);setDirection(type);setAmount('1');setReason(type==='in'?'Entrada de mercadorias':'Saída administrativa');
  const first=(v.inventory_lots??[]).find(l=>l.on_hand>0);
  setLotCode(type==='out'?(first?.lot_code??'SEM-LOTE'):'SEM-LOTE');
  setExpiry('');setError('');setNotice('');
 }
 function changeDirection(type:'in'|'out'){
  setDirection(type);setReason(type==='in'?'Entrada de mercadorias':'Saída administrativa');
  const first=selected?.inventory_lots.find(l=>l.on_hand>0);
  setLotCode(type==='out'?(first?.lot_code??'SEM-LOTE'):'SEM-LOTE');
  setExpiry('');
 }
 async function adjust(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!selected||saving)return;setSaving(true);setError('');setNotice('');
  try{
   if(!/^\d+$/.test(amount)||Number(amount)<=0||Number(amount)>100000)throw new Error('Informe uma quantidade inteira de 1 a 100.000.');
   if(reason.trim().length<3)throw new Error('Informe um motivo com pelo menos três caracteres.');
   if(!lotCode.trim())throw new Error('Informe o código do lote.');
   const delta=(direction==='in'?1:-1)*Number(amount);
   const sb=createClient();
   const {error:rpcError}=await sb.rpc('adjust_stock',{
    p_variant_id:selected.id,p_delta:delta,p_reason:reason.trim(),p_lot_code:lotCode.trim(),
    p_expires_at:expiry||null
   });
   if(rpcError)throw rpcError;
   setSelected(null);setNotice((direction==='in'?'Entrada':'Saída')+' registrada com sucesso, com histórico e lote atualizados.');
   router.refresh();
  }catch(err){setError(err instanceof Error?err.message:'Erro ao registrar a movimentação.');}
  finally{setSaving(false);}
 }
 const lotChoices=selected?.inventory_lots?.filter(l=>l.on_hand>0)??[];
 return <div className="container admin-workspace">
  <div className="admin-top"><div><div className="section-kicker">GESTÃO • POPÊ BEAUTY</div><h1>Central de estoque 📦</h1><p>Saldo por SKU, lotes, validade e movimentações registradas.</p></div><Link href="/admin/produtos" className="admin-primary"><PackageSearch size={18}/> Produtos</Link></div>
  <div className="admin-metric-row stock-metrics">
   <div><Boxes/><small>SKUs cadastrados</small><strong>{metrics.all}</strong></div>
   <div><Warehouse/><small>Unidades físicas</small><strong>{metrics.units}</strong></div>
   <div><ShieldAlert/><small>Abaixo do mínimo</small><strong>{metrics.low}</strong></div>
   <div><CalendarClock/><small>Vencendo em até 60 dias</small><strong>{metrics.expiring}</strong></div>
   <div><Clock/><small>Com lotes vencidos</small><strong>{metrics.expired}</strong></div>
  </div>
  <div className="demo-alert">O estoque registrado aqui é local ao sistema Popê. A sincronização com Shopee e Mercado Livre ainda não está ativada; não altere estoques nos marketplaces esperando atualização automática.</div>
  <div className="admin-filterbar"><label className="admin-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar por produto, SKU, tonalidade ou marca"/></label>
   <select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filtro de estoque">
    <option value="todos">Todos os SKUs</option><option value="baixo">Abaixo do mínimo</option><option value="vencendo">Próximos do vencimento</option><option value="vencido">Com lote vencido</option><option value="ok">Situação normal</option>
   </select></div>
  {notice?<div className="form-success" role="status"><CheckCircle2 size={16}/> {notice}</div>:null}
  <div className="admin-data-table stock-table">
   <div className="admin-data-head"><span>Produto / SKU</span><span>Físico</span><span>Reservado</span><span>Disponível</span><span>Mínimo</span><span>Situação</span><span>Movimentar</span></div>
   {visible.map(v=>{
    const on=v.inventory?.on_hand??0,reserved=v.inventory?.reserved??0,min=v.inventory?.safety_stock??0;
    const status=statusFor(v);
    return <div key={v.id} className="admin-data-row">
     <div className="admin-product-name"><div className="admin-product-thumb">📦</div><div><strong>{v.products?.name??'Produto removido'}</strong><small>SKU {v.sku}</small>{v.shade?<small>{v.shade}</small>:null}</div></div>
     <strong>{on}</strong><span>{reserved}</span><strong>{on-reserved}</strong><span>{min}</span>
     <span className={'admin-status '+(status==='ok'?'live':status==='baixo'?'draft':'warning')}>{status==='ok'?'Normal':status==='baixo'?'Baixo':status==='vencendo'?'Vencendo':'Vencido'}</span>
     <div className="stock-actions"><button onClick={()=>start(v,'in')} className="stock-add" aria-label={'Entrada de '+v.sku}><ArrowDown size={17}/> Entrada</button><button onClick={()=>start(v,'out')} className="stock-remove" aria-label={'Saída de '+v.sku}><ArrowUp size={17}/> Saída</button></div>
     {(v.inventory_lots??[]).length>0?<details className="admin-row-variants"><summary>Ver lotes ({v.inventory_lots.length})</summary><div className="stock-lot-list">{v.inventory_lots.map(l=><div key={l.id}><span><strong>{l.lot_code}</strong></span><span>{l.on_hand} un.</span><span>Validade: {readableDate(l.expires_at)}</span></div>)}</div></details>:null}
    </div>;
   })}
   {visible.length===0?<div className="admin-empty"><Warehouse size={35}/><h3>Nenhum SKU para exibir</h3><p>Cadastre um produto com variação para iniciar o estoque.</p><Link className="admin-primary" href="/admin/produtos">Cadastrar produto</Link></div>:null}
  </div>
  {selected?<div className="admin-modal-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setSelected(null);}}>
   <section className="admin-modal smaller" role="dialog" aria-modal="true" aria-label="Movimentar estoque">
    <div className="admin-modal-header"><div><span className="section-kicker">MOVIMENTAÇÃO DE ESTOQUE</span><h2>{selected.products?.name} 📦</h2><p>SKU {selected.sku} • Saldo {selected.inventory?.on_hand??0} un.</p></div><button onClick={()=>setSelected(null)} aria-label="Fechar" disabled={saving}><X/></button></div>
    <form className="admin-form" onSubmit={adjust}>
     <div className="stock-toggle"><button type="button" className={direction==='in'?'selected':''} onClick={()=>changeDirection('in')}><ArrowDown size={17}/> Entrada</button><button type="button" className={direction==='out'?'selected danger':''} onClick={()=>changeDirection('out')}><ArrowUp size={17}/> Saída</button></div>
     <div className="admin-form-grid">
      <label>Quantidade *<input type="number" required min={1} max={100000} value={amount} onChange={e=>setAmount(e.target.value)}/></label>
      <label>Motivo *<select value={reason} onChange={e=>setReason(e.target.value)}>
       {direction==='in'?<><option>Entrada de mercadorias</option><option>Devolução ao estoque</option><option>Ajuste de inventário</option></>:<><option>Saída administrativa</option><option>Perda / avaria</option><option>Vencimento / descarte</option><option>Ajuste de inventário</option></>}
      </select></label>
      {direction==='out'&&lotChoices.length>0?<label>Lote de origem *<select value={lotCode} onChange={e=>{setLotCode(e.target.value);setExpiry('');}}>{lotChoices.map(l=><option key={l.id} value={l.lot_code}>{l.lot_code} — {l.on_hand} un.</option>)}</select></label>:
       <label>Lote *<input required maxLength={60} value={lotCode} onChange={e=>setLotCode(e.target.value)} placeholder="LOT-2026-01"/></label>}
      <label>Validade do lote{direction==='in'?<input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)}/>:<input type="date" disabled value={lotChoices.find(l=>l.lot_code===lotCode)?.expires_at??''}/>}</label>
     </div>
     <p className="admin-help">O movimento será gravado com lote e motivo em uma operação atômica. Quantidades negativas ou acima do saldo disponível são rejeitadas pelo banco.</p>
     {error?<p className="form-error" role="alert">{error}</p>:null}
     <div className="admin-form-footer"><button type="button" className="admin-outline" onClick={()=>setSelected(null)} disabled={saving}>Cancelar</button><button className="admin-primary" type="submit" disabled={saving}>{saving?'Registrando...':'Confirmar '+(direction==='in'?'entrada':'saída')}</button></div>
    </form>
   </section>
  </div>:null}
 </div>;
}
