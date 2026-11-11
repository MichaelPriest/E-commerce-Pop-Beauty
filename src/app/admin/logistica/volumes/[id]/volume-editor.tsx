'use client';
import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {createClient} from '@/lib/supabase/browser';

type RecordVolume={volume_number:number;weight_g:number;height_cm:number;
 width_cm:number;length_cm:number;contents_note:string|null};
type Props={orderId:string;count:number;editable:boolean;records:RecordVolume[]};
type FormFields={weight:string;height:string;width:string;length:string;note:string};
export function VolumeEditor({orderId,count,editable,records}:Props){
 const router=useRouter();
 const [selected,setSelected]=useState(1);
 const [drafts,setDrafts]=useState<Record<number,FormFields>>({});
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const saved=records.find(r=>r.volume_number===selected);
 const form=drafts[selected]??{
  weight:String(saved?.weight_g??''),height:String(saved?.height_cm??''),
  width:String(saved?.width_cm??''),length:String(saved?.length_cm??''),
  note:saved?.contents_note??''
 };
 function update(field:keyof FormFields,value:string){
  setDrafts(d=>({...d,[selected]:{...form,[field]:value}}));
  setNotice('');setError('');
 }
 async function submit(e:FormEvent){
  e.preventDefault();if(saving||!editable)return;
  const weight=Number(form.weight),height=Number(form.height),width=Number(form.width),length=Number(form.length);
  if(!/^\d+$/.test(form.weight)||!Number.isInteger(weight)||weight<1||weight>500000||
   ![height,width,length].every(n=>Number.isFinite(n)&&n>0&&n<=300&&Math.abs(Math.round(n*100)-n*100)<1e-8)){
   setError('Informe peso inteiro em gramas e dimensões positivas até 300 cm, com no máximo 2 casas decimais.');
   return;
  }
  setSaving(true);setError('');setNotice('');
  try{
   const sb=createClient();
   const {error:saveError}=await sb.rpc('save_internal_package_volume',{
    p_order_id:orderId,p_number:selected,p_weight:weight,
    p_height:height,p_width:width,p_length:length,p_note:form.note.trim()||null
   });
   if(saveError)throw new Error(saveError.message);
   setNotice('Medidas do volume '+selected+' salvas para preparação interna.');
   setDrafts(d=>{const copy={...d};delete copy[selected];return copy;});
   router.refresh();
  }catch(err){setError(err instanceof Error?err.message:'Falha ao salvar volume.');}
  finally{setSaving(false);}
 }
 const savedCount=records.filter(r=>r.volume_number>=1&&r.volume_number<=count).length;
 return <section className="ops-form-card">
  <h2>Volumes previstos: {count}</h2>
  <p className="admin-help">Medidas cadastradas: {savedCount}/{count}. Preencha individualmente cada volume.
   Alterações são bloqueadas depois do despacho.</p>
  <div className="pope-fiscal-tabs">
   {Array.from({length:count},(_,i)=><button type="button" key={i+1}
    className={selected===i+1?'active':''} onClick={()=>{setSelected(i+1);setError('');setNotice('');}}>
    Volume {i+1} {records.some(r=>r.volume_number===i+1)?'✓':'—'}
   </button>)}
  </div>
  <form onSubmit={submit} className="admin-form">
   <div className="admin-form-grid">
    <label>Peso bruto (gramas)<input type="number" min="1" max="500000" step="1" required
     disabled={!editable||saving} value={form.weight} onChange={e=>update('weight',e.target.value)}/></label>
    <label>Altura (cm)<input type="number" min="0.01" max="300" step="0.01" required
     disabled={!editable||saving} value={form.height} onChange={e=>update('height',e.target.value)}/></label>
    <label>Largura (cm)<input type="number" min="0.01" max="300" step="0.01" required
     disabled={!editable||saving} value={form.width} onChange={e=>update('width',e.target.value)}/></label>
    <label>Comprimento (cm)<input type="number" min="0.01" max="300" step="0.01" required
     disabled={!editable||saving} value={form.length} onChange={e=>update('length',e.target.value)}/></label>
    <label className="full">Conteúdo / observação<input maxLength={250} disabled={!editable||saving}
     value={form.note} onChange={e=>update('note',e.target.value)}
     placeholder="Ex.: caixa com itens frágeis"/></label>
   </div>
   {error?<p className="form-error" role="alert">{error}</p>:null}
   {notice?<p className="form-success" role="status">{notice}</p>:null}
   <div className="admin-form-footer"><button className="admin-primary" type="submit"
    disabled={!editable||saving}>{saving?'Salvando...':'Salvar medidas do volume'}</button></div>
  </form>
  {!editable?<p className="admin-help">Consulta somente leitura: pedido fora da etapa de preparação.</p>:null}
 </section>;
}
