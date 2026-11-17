'use client';
import {useMemo,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {Building2,CheckCircle2,Plus,Search,Save,Pencil} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {supplierTaxIdValid} from '@/lib/supplier-tax-id';
type Supplier={id:string;name:string;tax_id:string|null;email:string|null;
 phone:string|null;notes:string;active:boolean;created_at:string};
const empty=()=>({name:'',tax_id:'',email:'',phone:'',notes:'',active:true});
export function SupplierManager({suppliers}:{suppliers:Supplier[]}){
 const router=useRouter();
 const [search,setSearch]=useState('');
 const [editing,setEditing]=useState<string|null>(null);
 const [form,setForm]=useState(empty);
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false);
 const [notice,setNotice]=useState(''),[error,setError]=useState('');
 const visible=useMemo(()=>suppliers.filter(s=>
  [s.name,s.tax_id,s.email,s.phone].join(' ').toLocaleLowerCase('pt-BR')
   .includes(search.trim().toLocaleLowerCase('pt-BR'))),[suppliers,search]);
 function start(){
  setEditing(null);setForm(empty());setOpen(true);setError('');setNotice('');
 }
 function edit(s:Supplier){
  setEditing(s.id);setForm({name:s.name,tax_id:s.tax_id??'',
   email:s.email??'',phone:s.phone??'',notes:s.notes,active:s.active});
  setOpen(true);setError('');setNotice('');
 }
 function change<K extends keyof ReturnType<typeof empty>>(
  field:K,value:ReturnType<typeof empty>[K]
 ){
  setForm(prev=>({...prev,[field]:value}));
 }
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  const name=form.name.trim(),tax_id=form.tax_id.replace(/\D/g,'');
  if(name.length<2||name.length>180){setError('Nome entre 2 e 180 caracteres.');return;}
  if(tax_id&&!supplierTaxIdValid(tax_id)){
   setError('CPF/CNPJ inválido: verifique os dígitos e o código verificador.');return;
  }
  if(form.email&&(!form.email.includes('@')||form.email.length>254)){
   setError('E-mail inválido.');return;
  }
  if(form.notes.length>1000||form.phone.length>30){
   setError('Telefone ou observações acima do limite.');return;
  }
  setBusy(true);setError('');setNotice('');
  try{
   const sb=createClient();
   const values={
    name,tax_id:tax_id||null,email:form.email.trim()||null,
    phone:form.phone.trim()||null,notes:form.notes.trim(),active:form.active
   };
   const response=editing?
    sb.from('suppliers').update(values).eq('id',editing):
    sb.from('suppliers').insert(values);
   const {error:err}=await response;
   if(err)throw err;
   setNotice(editing?'Fornecedor atualizado.':'Fornecedor cadastrado.');
   setOpen(false);router.refresh();
  }catch(err){
   const e=err as {message?:string;code?:string};
   setError(e.code==='23505'?'CPF/CNPJ já cadastrado.':
    e.message??'Não foi possível salvar o fornecedor.');
  }finally{setBusy(false);}
 }
 return <>
  <div className="admin-top pope-supplier-toolbar">
   <label className="admin-search"><Search size={17}/>
    <input value={search} placeholder="Buscar fornecedor, CNPJ, e-mail ou telefone"
     onChange={e=>setSearch(e.target.value)}/>
   </label>
   <button type="button" className="admin-primary" onClick={start}>
    <Plus size={18}/> Novo fornecedor
   </button>
  </div>
  {notice?<p className="form-success" role="status">
   <CheckCircle2 size={17}/> {notice}</p>:null}
  {error&&!open?<p className="form-error" role="alert">{error}</p>:null}
  <div className="ops-table-scroll"><table className="ops-table">
   <thead><tr><th>Fornecedor</th><th>CPF / CNPJ</th><th>Contato</th>
    <th>Status</th><th>Ação</th></tr></thead>
   <tbody>{visible.map(s=><tr key={s.id}>
    <td><strong>{s.name}</strong></td><td>{s.tax_id??'Não informado'}</td>
    <td>{s.email??s.phone??'—'}</td>
    <td><span className={'admin-status '+(s.active?'live':'draft')}>
     {s.active?'Ativo':'Inativo'}</span></td>
    <td><button type="button" className="admin-outline"
     onClick={()=>edit(s)}><Pencil size={16}/> Editar</button></td>
   </tr>)}</tbody>
  </table></div>
  {!visible.length?<div className="admin-empty"><Building2 size={30}/>
   <h3>Nenhum fornecedor encontrado</h3>
   <p>Cadastre os fornecedores para organizar os recebimentos.</p></div>:null}
  <p className="admin-help">Inativar um fornecedor não exclui o histórico
   de recebimentos. A numeração fiscal e os documentos oficiais devem ser
   conferidos no sistema emissor correspondente.</p>
  {open?<div className="admin-modal-overlay" role="presentation"
   onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setOpen(false);}}>
   <section className="admin-modal smaller" role="dialog" aria-modal="true"
    aria-label={editing?'Editar fornecedor':'Novo fornecedor'}>
    <div className="admin-modal-header">
     <div><span className="section-kicker">CADASTRO</span>
      <h2>{editing?'Editar fornecedor':'Cadastrar fornecedor'}</h2></div>
     <button disabled={busy} type="button" aria-label="Fechar"
      onClick={()=>setOpen(false)}>×</button>
    </div>
    <form className="admin-form" onSubmit={save}>
     <div className="admin-form-grid">
      <label className="full">Nome / Razão social *
       <input value={form.name} required maxLength={180} autoFocus
        onChange={e=>change('name',e.target.value)}/></label>
      <label>CPF / CNPJ
       <input value={form.tax_id} maxLength={20} inputMode="numeric"
        placeholder="Somente números" onChange={e=>change('tax_id',e.target.value)}/></label>
      <label>Telefone
       <input value={form.phone} maxLength={30}
        onChange={e=>change('phone',e.target.value)}/></label>
      <label className="full">E-mail
       <input type="email" value={form.email} maxLength={254}
        onChange={e=>change('email',e.target.value)}/></label>
      <label className="full">Observações
       <textarea rows={3} value={form.notes} maxLength={1000}
        onChange={e=>change('notes',e.target.value)}/></label>
      <label className="admin-form-check">
       <input type="checkbox" checked={form.active}
        onChange={e=>change('active',e.target.checked)}/> Fornecedor ativo
      </label>
     </div>
     {error?<p className="form-error" role="alert">{error}</p>:null}
     <div className="admin-form-footer">
      <button type="button" className="admin-outline" disabled={busy}
       onClick={()=>setOpen(false)}>Cancelar</button>
      <button type="submit" className="admin-primary" disabled={busy}>
       <Save size={17}/> {busy?'Salvando...':'Salvar fornecedor'}</button>
     </div>
    </form>
   </section>
  </div>:null}
  <Link className="admin-outline" href="/admin/estoque/recebimento">
   Abrir recebimento de mercadorias
  </Link>
 </>;
}
