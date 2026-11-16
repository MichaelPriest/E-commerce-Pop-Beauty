'use client';
import {useMemo,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {
 FolderTree,FolderPlus,FolderOpen,Plus,Pencil,Search,ShieldAlert,
 CheckCircle2,Archive,RotateCcw,ArrowLeft
} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {
 type CatalogCategory,sortedCategoryTree,suggestedCategorySlug
} from '@/lib/catalog-category-core';

type Props={categories:CatalogCategory[];truncated:boolean};
type FormState={
 id:string|null;name:string;parent_id:string;position:string;
 active:boolean;is_adult:boolean;
};
const startForm=(parent?:CatalogCategory|null):FormState=>({
 id:null,name:'',parent_id:parent?.id??'',position:String(parent?.position??0),
 active:true,is_adult:parent?.is_adult??false
});
export function CategoryManager({categories,truncated}:Props){
 const router=useRouter();
 const [form,setForm]=useState<FormState|null>(null);
 const [query,setQuery]=useState(''),[inactive,setInactive]=useState(true);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const roots=useMemo(()=>sortedCategoryTree(categories),[categories]);
 const visible=useMemo(()=>roots.filter(root=>{
  const q=query.trim().toLocaleLowerCase('pt-BR');
  if(!inactive&&!root.active&&!root.children.some(child=>child.active))return false;
  return !q||root.name.toLocaleLowerCase('pt-BR').includes(q)||
   root.children.some(child=>child.name.toLocaleLowerCase('pt-BR').includes(q));
 }),[roots,query,inactive]);
 const selectedParent=categories.find(x=>x.id===form?.parent_id)??null;
 const suggested=form?.id?categories.find(c=>c.id===form.id)?.slug??'':
  suggestedCategorySlug(form?.name??'',selectedParent);
 const mainCount=categories.filter(x=>!x.parent_id).length;
 const childCount=categories.length-mainCount;
 const activeCount=categories.filter(x=>x.active).length;
 function newCategory(parent:CatalogCategory|null=null){
  setForm(startForm(parent));setError('');setNotice('');
 }
 function editCategory(category:CatalogCategory){
  setForm({id:category.id,name:category.name,parent_id:category.parent_id??'',
   position:String(category.position),active:category.active,is_adult:category.is_adult});
  setError('');setNotice('');
 }
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!form||busy)return;
  const name=form.name.trim();
  const position=Number(form.position);
  if(name.length<2||name.length>100){
   setError('Informe um nome entre 2 e 100 caracteres.');return;
  }
  if(!Number.isSafeInteger(position)||position<0||position>99999){
   setError('A ordem deve ser um número inteiro entre 0 e 99999.');return;
  }
  const parent=categories.find(c=>c.id===form.parent_id)??null;
  if(form.parent_id&&(!parent||parent.parent_id)){
   setError('Selecione uma categoria principal válida.');return;
  }
  if(!form.id&&!suggested){
   setError('Informe um nome que produza um endereço válido.');return;
  }
  if(!form.id&&suggested.length>160){
   setError('O endereço ficou muito longo. Use um nome mais curto.');return;
  }
  if(!form.id&&categories.some(c=>c.slug===suggested)){
   setError('Este endereço já existe. Escolha outro nome.');return;
  }
  if(form.active&&parent&&!parent.active){
   setError('Ative primeiro a categoria principal.');return;
  }
  setBusy(true);setError('');setNotice('');
  try{
   const sb=createClient();
   if(form.id){
    const {error:err}=await sb.from('categories')
     .update({name,position,active:form.active}).eq('id',form.id);
    if(err)throw err;
    setNotice('Categoria atualizada. Os produtos vinculados foram preservados.');
   }else{
    const {error:err}=await sb.from('categories').insert({
     name,slug:suggested,parent_id:parent?.id??null,position,
     active:form.active,is_adult:parent?.is_adult??form.is_adult
    });
    if(err)throw err;
    setNotice(parent?'Subcategoria cadastrada.':'Categoria principal cadastrada.');
   }
   setForm(null);router.refresh();
  }catch(e){
   const err=e as {message?:string;code?:string};
   setError(err.code==='23505'?'Este endereço já está em uso. Altere o nome.':
    err.message??'Não foi possível salvar a categoria.');
  }finally{setBusy(false);}
 }
 async function toggleActive(item:CatalogCategory){
  if(busy)return;
  if(item.active&&!window.confirm(
   'Desativar '+item.name+'? A vitrine deixará de listar esta categoria. '+
   'O banco impedirá a ação se houver produtos ou subcategorias ativos vinculados.'
  ))return;
  setBusy(true);setError('');setNotice('');
  try{
   const {error:err}=await createClient().from('categories')
    .update({active:!item.active}).eq('id',item.id);
   if(err)throw err;
   setNotice(item.active?'Categoria desativada.':'Categoria ativada.');
   router.refresh();
  }catch(e){
   setError(e instanceof Error?e.message:'Não foi possível alterar o status.');
  }finally{setBusy(false);}
 }
 return <div className="container admin-workspace pope-category-admin">
  <div className="admin-top">
   <div><div className="section-kicker">POPÊ BEAUTY • CATÁLOGO</div>
    <h1><FolderTree size={27}/> Categorias e subcategorias</h1>
    <p>Organize os produtos por departamento e por tipo de produto, sem alterar seus SKUs.</p>
   </div>
   <div className="admin-form-footer">
    <Link href="/admin/produtos" className="admin-outline"><ArrowLeft size={16}/> Produtos</Link>
    <button type="button" className="admin-primary" onClick={()=>newCategory()}>
     <Plus size={17}/> Nova categoria</button>
   </div>
  </div>
  <div className="admin-metric-row">
   <div><FolderTree/><small>Categorias principais</small><strong>{mainCount}</strong></div>
   <div><FolderOpen/><small>Subcategorias</small><strong>{childCount}</strong></div>
   <div><CheckCircle2/><small>Ativas</small><strong>{activeCount}</strong></div>
  </div>
  <p className="ops-info"><ShieldAlert size={17}/>
   Desativar não exclui produtos. A operação é bloqueada quando existem produtos
   ou subcategorias ativas vinculadas. A classificação etária é preservada
   automaticamente nas subcategorias.</p>
  {truncated?<p className="form-error">Há mais de 500 categorias. A lista exibida
   foi limitada; use o banco para revisar o restante antes de editar.</p>:null}
  {notice?<p className="form-success" role="status">{notice}</p>:null}
  {error&&!form?<p className="form-error" role="alert">{error}</p>:null}
  <div className="admin-filterbar">
   <label className="admin-search"><Search size={16}/>
    <input aria-label="Buscar categorias" placeholder="Buscar categorias e subcategorias"
     value={query} onChange={e=>setQuery(e.target.value)}/>
   </label>
   <label className="pope-category-checkbox">
    <input type="checkbox" checked={inactive} onChange={e=>setInactive(e.target.checked)}/>
    Mostrar desativadas
   </label>
  </div>
  <div className="pope-category-tree">
   {visible.map(root=><section className="pope-category-group" key={root.id}>
    <div className="pope-category-main">
     <div className="pope-category-name">
      <FolderTree size={23}/>
      <div><strong>{root.name}</strong><small>/{root.slug} ·
       {' '}{root.is_adult?'Acesso restrito':'Catálogo geral'} ·
       {' '}{root.children.length} subcategoria(s)</small></div>
     </div>
     <span className={root.active?'admin-status live':'admin-status draft'}>
      {root.active?'Ativa':'Desativada'}</span>
     <div className="pope-category-actions">
      <button type="button" className="admin-outline" disabled={busy||!root.active}
       onClick={()=>newCategory(root)}><FolderPlus size={15}/> Subcategoria</button>
      <button type="button" className="admin-outline" disabled={busy}
       onClick={()=>editCategory(root)}><Pencil size={15}/> Editar</button>
      <button type="button" className="admin-outline" disabled={busy}
       onClick={()=>void toggleActive(root)}>
       {root.active?<Archive size={15}/>:<RotateCcw size={15}/>}
       {root.active?'Desativar':'Ativar'}</button>
     </div>
    </div>
    {root.children.length?<div className="pope-category-children">
     {root.children.filter(child=>inactive||child.active).map(child=>
      <div className="pope-category-child" key={child.id}>
       <div className="pope-category-name">
        <FolderOpen size={19}/>
        <div><strong>{child.name}</strong><small>/{child.slug}</small></div>
       </div>
       <span className={child.active?'admin-status live':'admin-status draft'}>
        {child.active?'Ativa':'Desativada'}</span>
       <div className="pope-category-actions">
        <button type="button" className="admin-outline" disabled={busy}
         onClick={()=>editCategory(child)}><Pencil size={15}/> Editar</button>
        <button type="button" className="admin-outline" disabled={busy}
         onClick={()=>void toggleActive(child)}>
         {child.active?<Archive size={15}/>:<RotateCcw size={15}/>}
         {child.active?'Desativar':'Ativar'}</button>
       </div>
      </div>)}
    </div>:null}
   </section>)}
   {!visible.length?<div className="admin-empty">
    <FolderTree size={30}/><h3>Nenhuma categoria encontrada</h3>
    <p>Crie uma categoria principal para começar a organizar o catálogo.</p>
   </div>:null}
  </div>
  {form?<div className="admin-modal-overlay" role="presentation"
   onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setForm(null);}}>
   <section className="admin-modal smaller" role="dialog" aria-modal="true"
    aria-label={form.id?'Editar categoria':'Cadastrar categoria'}>
    <div className="admin-modal-header"><div>
     <span className="section-kicker">ORGANIZAÇÃO DO CATÁLOGO</span>
     <h2>{form.id?'Editar categoria':
      form.parent_id?'Nova subcategoria':'Nova categoria principal'}</h2>
    </div><button type="button" aria-label="Fechar" disabled={busy}
      onClick={()=>setForm(null)}>×</button></div>
    <form className="admin-form" onSubmit={save}>
     <div className="admin-form-grid">
      <label className="full">Nome da categoria *
       <input autoFocus required minLength={2} maxLength={100} value={form.name}
        onChange={e=>setForm(f=>f?{...f,name:e.target.value}:null)}
        placeholder="Ex.: Batons, Maquiagem, Hidratantes"/>
      </label>
      <label>Categoria principal
       <select value={form.parent_id} disabled={!!form.id}
        onChange={e=>{
         const parent=categories.find(c=>c.id===e.target.value);
         setForm(f=>f?{...f,parent_id:e.target.value,is_adult:parent?.is_adult??false}:null);
        }}>
        <option value="">Nenhuma — categoria principal</option>
        {roots.filter(c=>c.active).map(root=>
         <option key={root.id} value={root.id}>{root.name}</option>)}
       </select>
      </label>
      <label>Ordem de exibição
       <input type="number" min={0} max={99999} step={1} value={form.position}
        onChange={e=>setForm(f=>f?{...f,position:e.target.value}:null)}/>
      </label>
      <label className="full">Endereço gerado
       <input value={suggested||'Preencha o nome'} disabled readOnly/>
      </label>
      {!form.id&&!selectedParent?<label className="admin-form-check">
       <input type="checkbox" checked={form.is_adult}
        onChange={e=>setForm(f=>f?{...f,is_adult:e.target.checked}:null)}/>
       Área com acesso restrito por idade
      </label>:null}
      <label className="admin-form-check">
       <input type="checkbox" checked={form.active}
        onChange={e=>setForm(f=>f?{...f,active:e.target.checked}:null)}/>
       Categoria ativa
      </label>
     </div>
     {form.id?<p className="admin-help">O endereço e a hierarquia ficam preservados
      durante a edição para evitar links quebrados ou reclassificações indevidas.</p>:
      <p className="admin-help">O endereço é gerado uma única vez com base no nome e
       na categoria principal. Se a loja já estiver usando links, não será
       modificado ao renomear.</p>}
     {error?<p className="form-error" role="alert">{error}</p>:null}
     <div className="admin-form-footer">
      <button type="button" className="admin-outline" disabled={busy}
       onClick={()=>setForm(null)}>Cancelar</button>
      <button type="submit" className="admin-primary" disabled={busy}>
       {busy?'Salvando...':'Salvar categoria'}</button>
     </div>
    </form>
   </section>
  </div>:null}
 </div>;
}
