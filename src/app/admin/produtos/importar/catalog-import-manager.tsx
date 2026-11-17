'use client';
import {useMemo,useState,type ChangeEvent} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {
 AlertTriangle,CheckCircle2,ClipboardCheck,Download,FileSpreadsheet,
 LockKeyhole,PackagePlus,Search,ShieldCheck,UploadCloud
} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {
 CATALOG_CSV_TEMPLATE,parseCatalogCsv,type CatalogCsvRow
} from '@/lib/catalog-csv-core';

type Category={id:string;slug:string;name:string};
type Result={validated:boolean;dry_run:boolean;created:number;updated:number;
 rows:{line:number;action:string;sku:string;slug?:string}[]};
const formatCents=(n:number)=>(n/100).toLocaleString('pt-BR',
 {style:'currency',currency:'BRL'});
export function CatalogImportManager({categories}:{categories:Category[]}){
 const router=useRouter();
 const [name,setName]=useState('');
 const [rows,setRows]=useState<CatalogCsvRow[]>([]);
 const [localErrors,setLocalErrors]=useState<string[]>([]);
 const [query,setQuery]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),
  [serverError,setServerError]=useState('');
 const [validatedPayload,setValidatedPayload]=useState('');
 const [result,setResult]=useState<Result|null>(null);
 const payload=JSON.stringify(rows);
 const ready=rows.length>0&&!localErrors.length;
 const verified=ready&&validatedPayload===payload;
 const validCategory=new Set(categories.map(x=>x.slug));
 const categoryErrors=rows.map((r,i)=>!validCategory.has(r.category_slug)?
  'Linha '+(i+2)+': categoria "'+r.category_slug+
   '" não está disponível. Cadastre ou escolha uma categoria pública ativa.':''
 ).filter(Boolean);
 const visible=useMemo(()=>rows.filter(r=>!query.trim()||
  [r.sku,r.slug,r.name,r.ean,r.category_slug].join(' ')
   .toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))
 ),[rows,query]);
 function clearStatus(){
  setValidatedPayload('');setResult(null);setMessage('');setServerError('');
 }
 async function selectFile(event:ChangeEvent<HTMLInputElement>){
  clearStatus();setRows([]);setLocalErrors([]);
  const file=event.target.files?.[0];
  event.target.value='';
  if(!file){setName('');return;}
  setName(file.name);
  if(file.size>256000||file.size===0){
   setLocalErrors(['Arquivo vazio ou acima de 256 KB.']);return;
  }
  try{
   const value=await file.text();
   const parsed=parseCatalogCsv(value);
   setRows(parsed.rows);
   setLocalErrors(parsed.errors);
  }catch(error){
   setLocalErrors([error instanceof Error?error.message:'CSV não reconhecido.']);
  }
 }
 function downloadTemplate(){
  const blob=new Blob([CATALOG_CSV_TEMPLATE],
   {type:'text/csv;charset=utf-8'});
  const href=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=href;a.download='pope-beauty-modelo-produtos.csv';
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(href);
 }
 async function execute(dryRun:boolean){
  if(busy||!ready||categoryErrors.length)return;
  if(!dryRun&&!verified){
   setServerError('É necessário validar novamente antes de gravar.');return;
  }
  const initialPayload=payload;
  setBusy(true);setServerError('');setMessage('');
  try{
   const {data,error}=await createClient().rpc('bulk_upsert_catalog_csv',{
    p_rows:rows,p_validate_only:dryRun
   });
   if(error)throw error;
   const response=data as Result;
   if(!response?.validated)throw new Error('O banco não confirmou a validação.');
   setResult(response);
   if(dryRun){
    setValidatedPayload(initialPayload);
    setMessage('Validação concluída no banco, sem modificar produtos ou estoques.');
   }else{
    setValidatedPayload('');setRows([]);setName('');
    setMessage('Importação confirmada: '+response.created+' rascunho(s) criado(s) e '+
     response.updated+' produto(s) atualizado(s). Estoque não foi alterado.');
    router.refresh();
   }
  }catch(error){
   setValidatedPayload('');
   const message=error instanceof Error?error.message:'Não foi possível validar o arquivo.';
   setServerError(message+'. Nenhuma linha deste lote foi gravada se a transação falhou.');
  }finally{setBusy(false);}
 }
 return <>
  <div className="pope-csv-head-grid">
   <section className="ops-form-card">
    <h2><Download size={19}/> 1. Baixe o modelo</h2>
    <p>Preencha as colunas mantendo a ordem indicada. O modelo é compatível
     com CSV delimitado por ponto e vírgula e valores em reais.</p>
    <button type="button" className="admin-outline"
     onClick={downloadTemplate}><Download size={16}/> Baixar modelo CSV</button>
    <p className="admin-help">Use <code>criar</code> ou <code>atualizar</code>
     na coluna <code>acao</code>. O SKU pode ficar vazio somente na criação:
     será gerado automaticamente pelo banco.</p>
   </section>
   <section className="ops-form-card">
    <h2><UploadCloud size={19}/> 2. Selecione o CSV</h2>
    <label className="pope-csv-file-label">
     Arquivo CSV (até 40 linhas)
     <input type="file" accept=".csv,text/csv,text/plain"
      onChange={selectFile} disabled={busy}/>
    </label>
    <p className="admin-help">O importador não movimenta estoque, não publica
     novos produtos, não cria imagens e não integra marketplaces.</p>
    {name?<p className="pope-csv-file-name">
     <FileSpreadsheet size={16}/> {name}</p>:null}
   </section>
  </div>
  <section className="ops-form-card">
   <div className="pope-csv-section-heading"><div>
    <h2><ClipboardCheck size={19}/> 3. Confira e valide as linhas</h2>
    <p className="admin-help">A atualização identifica o produto pelo SKU e
     altera nome, categoria, marca, descrição, preço, custo e código de barras.
     Não modifica o SKU, slug, imagens, status de publicação ou estoque.</p>
   </div></div>
   <div className="pope-csv-summary">
    <span><PackagePlus size={16}/> Novos rascunhos:
     <strong>{rows.filter(x=>x.action==='create').length}</strong></span>
    <span><ClipboardCheck size={16}/> Atualizações:
     <strong>{rows.filter(x=>x.action==='update').length}</strong></span>
    <span><ShieldCheck size={16}/> Categorias públicas:
     <strong>{categories.length}</strong></span>
   </div>
   {rows.length>0?<label className="admin-search pope-csv-search">
    <Search size={17}/>
    <input value={query} onChange={e=>setQuery(e.target.value)}
     placeholder="Localizar SKU, produto ou código de barras"/>
   </label>:null}
   {localErrors.length||categoryErrors.length?
    <div className="form-error" role="alert">
     <strong>Corrija o arquivo e importe novamente:</strong>
     <ul>{[...localErrors,...categoryErrors].map((item,i)=>
      <li key={i}>{item}</li>)}</ul>
    </div>:null}
   {rows.length?<div className="ops-table-scroll">
    <table className="ops-table">
     <thead><tr><th>Ação</th><th>Produto</th><th>SKU</th>
      <th>Categoria</th><th>Preço</th><th>Custo</th><th>EAN/GTIN</th></tr></thead>
     <tbody>{visible.map((r,i)=><tr key={r.action+':'+r.slug+':'+r.sku+':'+i}>
      <td>{r.action==='create'?'Criar rascunho':'Atualizar'}</td>
      <td><strong>{r.name}</strong><small>{r.slug||'Slug preservado'}</small></td>
      <td>{r.sku||'Automático'}</td><td>{r.category_slug}</td>
      <td>{formatCents(r.price_cents)}</td><td>{formatCents(r.cost_cents)}</td>
      <td>{r.ean||'—'}</td></tr>)}</tbody>
    </table>
   </div>:<div className="admin-empty">
    <FileSpreadsheet size={29}/><h3>Nenhum arquivo selecionado</h3>
    <p>Importe o modelo preenchido para conferir os produtos antes de salvar.</p>
   </div>}
   {message?<p className="form-success" role="status"><CheckCircle2 size={17}/>
    {message}</p>:null}
   {serverError?<p className="form-error" role="alert"><AlertTriangle size={17}/>
    {serverError}</p>:null}
   <div className="pope-csv-commit-actions">
    <button className="admin-outline" type="button"
     disabled={busy||!ready||!!categoryErrors.length}
     onClick={()=>void execute(true)}>
     <ClipboardCheck size={17}/>{busy?'Conferindo...':'Validar no banco (sem gravar)'}
    </button>
    <button className="admin-primary" type="button"
     disabled={busy||!verified||!!categoryErrors.length}
     onClick={()=>void execute(false)}>
     <LockKeyhole size={17}/>{busy?'Processando...':'Confirmar importação'}
    </button>
   </div>
   <p className="admin-help">A importação é transacional: o banco valida
    novamente todas as linhas antes de salvar. Se uma falhar, nenhuma alteração
    deste lote é confirmada. Não existe opção de repetir a gravação automaticamente.</p>
  </section>
  <section className="ops-form-card">
   <h2>Referência das categorias</h2>
   <p className="admin-help">Use exatamente o slug mostrado abaixo em
    <code> categoria_slug</code>. Produtos +18 não são aceitos neste importador.</p>
   <div className="pope-csv-categories">
    {categories.map(category=><span key={category.id}>
     <code>{category.slug}</code> {category.name}</span>)}
   </div>
   <Link href="/admin/categorias" className="admin-outline">
    Gerenciar categorias e subcategorias
   </Link>
  </section>
 </>;
}
