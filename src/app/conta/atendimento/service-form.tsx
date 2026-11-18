'use client';
import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {Send,ShieldCheck} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {
 SERVICE_CATEGORIES,validateServiceRequest,type ServiceCategory
} from '@/lib/customer-service';

type OrderOption={id:string;created_at:string;status:string};
export function CustomerServiceForm({userId,orders,defaultOrderId=''}:{
 userId:string;orders:OrderOption[];defaultOrderId?:string;
}){
 const router=useRouter();
 const [orderId,setOrderId]=useState(defaultOrderId);
 const [category,setCategory]=useState<ServiceCategory>('entrega');
 const [subject,setSubject]=useState(''),[description,setDescription]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(busy)return;
  const issue=validateServiceRequest(category,subject,description);
  if(issue){setError(issue);return;}
  if(orderId&&!orders.some(o=>o.id===orderId)){
   setError('Selecione um pedido válido da sua conta.');return;
  }
  setBusy(true);setError('');setNotice('');
  try{
   const {error:saveError}=await createClient().from('customer_service_requests')
    .insert({
     user_id:userId,order_id:orderId||null,
     category,subject:subject.trim(),description:description.trim()
    });
   if(saveError){
    if(saveError.message.includes('três solicitações por hora'))
     throw new Error('Limite de três solicitações por hora. Tente novamente mais tarde.');
    throw new Error('Não foi possível registrar sua solicitação. Tente novamente.');
   }
   setSubject('');setDescription('');setOrderId('');
   setNotice('Solicitação registrada. Acompanhe o andamento na lista abaixo.');
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Erro ao registrar solicitação.');}
  finally{setBusy(false);}
 }
 return <section className="pope-support-form-panel">
  <h2>Nova solicitação</h2>
  <p>Descreva seu caso para que a equipe possa analisar. O envio não cancela pedidos nem inicia um reembolso automático.</p>
  <form className="admin-form" onSubmit={submit}>
   <div className="admin-form-grid">
    <label>Motivo do contato *
     <select required value={category} disabled={busy}
      onChange={e=>setCategory(e.target.value as ServiceCategory)}>
      {(Object.entries(SERVICE_CATEGORIES) as [ServiceCategory,string][])
       .map(([value,label])=><option key={value} value={value}>{label}</option>)}
     </select>
    </label>
    <label>Pedido relacionado
     <select value={orderId} disabled={busy} onChange={e=>setOrderId(e.target.value)}>
      <option value="">Sem pedido específico</option>
      {orders.map(o=><option key={o.id} value={o.id}>
       #{o.id.slice(0,8).toUpperCase()} · {new Date(o.created_at).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})}
      </option>)}
     </select>
    </label>
    <label className="full">Assunto *
     <input required minLength={5} maxLength={120} value={subject} disabled={busy}
      onChange={e=>setSubject(e.target.value)}
      placeholder="Ex.: Recebi um item diferente do pedido"/>
    </label>
    <label className="full">Descreva o que aconteceu *
     <textarea required minLength={20} maxLength={2000} rows={5}
      value={description} disabled={busy}
      onChange={e=>setDescription(e.target.value)}
      placeholder="Descreva o produto, a situação e o atendimento que você precisa."/>
    </label>
   </div>
   <p className="pope-support-privacy"><ShieldCheck size={17}/>
    Não informe senhas, números de cartão ou documentos completos neste formulário.
    Respostas e análise são feitas pela equipe, sem estornos automáticos.</p>
   {error?<p className="form-error" role="alert">{error}</p>:null}
   {notice?<p className="form-success" role="status">{notice}</p>:null}
   <button className="admin-primary" disabled={busy} type="submit">
    <Send size={17}/>{busy?'Registrando...':'Enviar solicitação'}
   </button>
  </form>
 </section>;
}
