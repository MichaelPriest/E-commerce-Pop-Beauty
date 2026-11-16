'use client';
import {useEffect,useMemo,useState, type ChangeEvent, type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {Boxes, Camera, ChevronDown, Edit3, PackagePlus, Plus, Search, Tag, X, Check, AlertTriangle, Layers3} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {formatBRL,productImageSrc} from '@/lib/products';
import type {AdminProduct, Category} from '@/types/admin';
import {catalogIssues,brazilTodayISO,CATALOG_ISSUE_LABELS} from '@/lib/catalog-quality';

type ProductForm = {
 name:string;slug:string;category_id:string;brand:string;description:string;
 price:string;cost:string;compare:string;image_url:string;active:boolean;
 sku:string;variant_name:string;shade:string;ean:string;stock:string;safety_stock:string;
 lot_code:string;expires_at:string;
};
const emptyForm=(categories:Category[]):ProductForm=>({
 name:'',slug:'',category_id:categories.find(c=>c.active!==false&&!c.parent_id)?.id??'',brand:'Popê Beauty',description:'',
 price:'',cost:'0',compare:'',image_url:'',active:false,sku:'',variant_name:'Padrão',
 shade:'',ean:'',stock:'0',safety_stock:'0',lot_code:'SEM-LOTE',expires_at:''
});
const cents=(input:string, optional=false):number|null=>{
 const s=input.trim().replace(/\s/g,'').replace(/^R\$/,'');
 if(optional&&!s)return null;
 if(!s||!/^(\d+)([.,]\d{1,2})?$/.test(s))throw new Error('Preços devem usar até 2 casas decimais, por exemplo 19,90.');
 const amount=Math.round(Number(s.replace(',','.'))*100);
 if(!Number.isSafeInteger(amount)||amount<0||amount>100000000)throw new Error('Valor fora do limite permitido.');
 return amount;
};
const integer=(input:string,label:string)=>{
 if(!/^\d+$/.test(input.trim()))throw new Error(label+': informe um número inteiro positivo.');
 const n=Number(input);if(!Number.isSafeInteger(n)||n>100000)return (()=>{throw new Error(label+': limite de 100.000 unidades.');})();
 return n;
};
const slugify=(name:string)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,160);
const prettyValue=(c:number|null)=>c===null?'':(c/100).toFixed(2).replace('.',',');

type Props={initialProducts:AdminProduct[];categories:Category[]};
export function ProductsManager({initialProducts,categories}:Props){
 const router=useRouter(),[query,setQuery]=useState(''),[filter,setFilter]=useState('todos');
 const [open,setOpen]=useState(false),[editing,setEditing]=useState<string|null>(null),[form,setForm]=useState<ProductForm>(()=>emptyForm(categories));
 const [formStep,setFormStep]=useState<1|2|3>(1);
 const [file,setFile]=useState<File|null>(null),[saving,setSaving]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const [variantFor,setVariantFor]=useState<AdminProduct|null>(null),[variantEditingId,setVariantEditingId]=useState<string|null>(null);
 const [vSku,setVSku]=useState(''),[vName,setVName]=useState(''),[vShade,setVShade]=useState(''),[vEan,setVEan]=useState(''),[vSafety,setVSafety]=useState('0');
 const isAdultCategory=!!categories.find(c=>c.id===form.category_id)?.is_adult;
 const qualityById=useMemo(()=>new Map(initialProducts.map(p=>[p.id,catalogIssues(p,brazilTodayISO())])),[initialProducts]);
 const missingQuality=initialProducts.filter(p=>p.active&&!p.is_adult&&
  (qualityById.get(p.id)?.length??0)>0).length;
 useEffect(()=>{
  try{
   if(new URLSearchParams(window.location.search).get('filtro')==='pendencias')
    setFilter('pendencias');
  }catch{/* Preferências de navegação opcionais. */}
 },[]);
 const filtered=useMemo(()=>initialProducts.filter(p=>{
  const q=query.toLocaleLowerCase('pt-BR');
  return (!q||[p.name,p.brand,p.slug,...(p.variants??[]).map(v=>v.sku)].join(' ').toLocaleLowerCase('pt-BR').includes(q)) &&
   (filter==='todos'||(filter==='ativos'?p.active:filter==='inativos'?!p.active:
    filter==='pendencias'?p.active&&!p.is_adult&&(qualityById.get(p.id)?.length??0)>0:true));
 }),[query,filter,initialProducts,qualityById]);
 const metrics=useMemo(()=>({
  all:initialProducts.length,
  active:initialProducts.filter(p=>p.active).length,
  variants:initialProducts.reduce((a,p)=>a+(p.variants??[]).length,0),
  low:initialProducts.reduce((a,p)=>a+(p.variants??[]).filter(v=>{
   const i=v.inventory; return i && (i.on_hand-i.reserved)<=i.safety_stock;
  }).length,0)
 }),[initialProducts]);
 const change=(k:keyof ProductForm,v:string|boolean)=>setForm(prev=>({...prev,[k]:v}));
 const clearMessages=()=>{setError('');setNotice('');};
 function advanceProductForm(){
  setError('');
  try{
   if(formStep===1){
    if(form.name.trim().length<2||!form.category_id||
     !slugify(form.slug||form.name))throw new Error('Preencha nome, categoria e endereço do produto.');
   }
   if(formStep===2){
    if(cents(form.price)===null||cents(form.cost)===null)
     throw new Error('Preencha preço e custo válidos.');
   }
   if(formStep<3)setFormStep((formStep+1) as 1|2|3);
  }catch(err){
   setError(err instanceof Error?err.message:'Verifique os campos desta etapa.');
  }
 }
 function startCreate(){setForm(emptyForm(categories));setEditing(null);setFile(null);setFormStep(1);clearMessages();setOpen(true);}
 function startEdit(p:AdminProduct){
   setEditing(p.id);setFile(null);setFormStep(1);clearMessages();
   setForm({...emptyForm(categories),name:p.name,slug:p.slug,category_id:p.category_id??'',brand:p.brand,
    description:p.description??'',price:prettyValue(p.price_cents),cost:prettyValue(p.cost_cents??0),
    compare:prettyValue(p.compare_at_cents),image_url:p.image_url??'',active:p.active});
   setOpen(true);
 }
 function onFile(e:ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0]??null;setFile(f);if(f)change('image_url','');}
 async function uploadImage(supabase:ReturnType<typeof createClient>){
  if(!file){
   const value=form.image_url.trim();
   if(isAdultCategory && value && !value.startsWith('adult-products:'))
    throw new Error('Produtos +18 só aceitam fotos no bucket privado. Selecione uma foto para upload.');
   if(!isAdultCategory && value.startsWith('adult-products:'))
    throw new Error('A foto privada não pode ser usada no catálogo comum.');
   return value||null;
  }
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Use JPG, PNG ou WebP.');
  if(file.size>5*1024*1024)throw new Error('Imagem deve ter até 5 MB.');
  const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
  const path='products/'+crypto.randomUUID()+'.'+ext;
  const bucket=isAdultCategory?'adult-products':'product-images';
  const {error:uploadError}=await supabase.storage.from(bucket).upload(path,file,{contentType:file.type,upsert:false});
  if(uploadError)throw uploadError;
  return isAdultCategory?'adult-products:'+path:supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
 }
 async function save(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(saving)return;
  if(formStep!==3){advanceProductForm();return;}
  setSaving(true);clearMessages();
  try{
   const name=form.name.trim();if(name.length<2)throw new Error('Informe o nome do produto.');
   const slug=slugify(form.slug||name);
   if(!slug||!form.category_id)throw new Error('Informe a categoria e o endereço do produto.');
   const price=cents(form.price), cost=cents(form.cost), compare=cents(form.compare,true);
   if(price===null||cost===null)throw new Error('Preço e custo são obrigatórios.');
   const sb=createClient();
   const imageUrl=await uploadImage(sb);
   const productData={
    name,slug,category_id:form.category_id,brand:form.brand.trim()||'Popê Beauty',
    description:form.description.trim(),price_cents:price,cost_cents:cost,compare_at_cents:compare,
    image_url:imageUrl,active:form.active
   };
   if(editing){
    const {error:upError}=await sb.from('products').update(productData).eq('id',editing);
    if(upError)throw upError;
    setNotice('Produto atualizado.');
   }else{
    // SKU vazio: gerado no banco, atomicamente, junto com o novo produto.
    if(/^POP-[0-9]{7,}$/.test(form.sku.trim()))
     throw new Error('Códigos POP numéricos são reservados. Deixe vazio para geração automática.');
    const stock=integer(form.stock,'Estoque inicial'),safety=integer(form.safety_stock,'Estoque de segurança');
    const {data:createdProductId,error:createError}=await sb.rpc('create_product_with_variant',{
     p_name:productData.name,p_slug:productData.slug,p_category_id:productData.category_id,
     p_description:productData.description,p_brand:productData.brand,
     p_price_cents:price,p_cost_cents:cost,p_compare_at_cents:compare,p_image_url:imageUrl,
     p_sku:form.sku.trim(),p_variant_name:form.variant_name.trim()||'Padrão',
     p_shade:form.shade.trim()||null,p_ean:form.ean.trim()||null,
     p_safety_stock:safety,p_initial_stock:stock,p_lot_code:form.lot_code.trim()||'SEM-LOTE',
     p_expires_at:form.expires_at||null,p_active:form.active
    });
    if(createError)throw createError;
    if(!form.sku.trim()&&createdProductId){
     const {data:createdVariant}=await sb.from('variants').select('sku')
      .eq('product_id',createdProductId).limit(1).maybeSingle();
     setNotice('Produto cadastrado. SKU automático: '+(createdVariant?.sku??'gerado pelo banco')+'.');
    }else setNotice('Produto cadastrado com SKU informado manualmente.');
   }
   setOpen(false);setEditing(null);setFile(null);router.refresh();
  }catch(err){setError(err instanceof Error?err.message:'Não foi possível salvar o produto.');}
  finally{setSaving(false);}
 }
 function openVariant(p:AdminProduct){
  setVariantEditingId(null);setVariantFor(p);setVSku('');setVName('Padrão');setVShade('');setVEan('');setVSafety('0');clearMessages();
 }
 function editVariant(p:AdminProduct,v:AdminProduct['variants'][number]){
  setVariantEditingId(v.id);setVariantFor(p);setVSku(v.sku);setVName(v.name);
  setVShade(v.shade??'');setVEan(v.ean??'');setVSafety(String(v.inventory?.safety_stock??0));clearMessages();
 }
 async function saveVariant(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!variantFor||saving)return;setSaving(true);clearMessages();
  try{
   const sb=createClient();
   const safety=integer(vSafety,'Estoque de segurança');
   const originalSku=variantEditingId?variantFor.variants.find(v=>v.id===variantEditingId)?.sku:null;
   if(variantEditingId&&!vSku.trim())throw new Error('Informe o SKU da variação existente.');
   if(vSku.trim()!==originalSku&&/^POP-[0-9]{7,}$/.test(vSku.trim()))
    throw new Error('Este formato é reservado. Deixe o campo vazio apenas ao criar uma nova variação.');
   if(variantEditingId){
    const {error:editError}=await sb.from('variants').update({sku:vSku.trim(),name:vName.trim()||'Padrão',
     shade:vShade.trim()||null,ean:vEan.trim()||null}).eq('id',variantEditingId).eq('product_id',variantFor.id);
    if(editError)throw editError;
    const {error:minimumError}=await sb.from('inventory').update({safety_stock:safety}).eq('variant_id',variantEditingId);
    if(minimumError)throw minimumError;
    setNotice('Variação atualizada. O saldo físico não foi alterado.');
   }else{
    const {data:createdVariantId,error:rpcError}=await sb.rpc('add_product_variant',{p_product_id:variantFor.id,p_sku:vSku.trim(),
     p_name:vName.trim()||'Padrão',p_shade:vShade.trim()||null,p_ean:vEan.trim()||null,
     p_safety_stock:safety});
    if(rpcError)throw rpcError;
    if(!vSku.trim()&&createdVariantId){
     const {data:variantSku}=await sb.from('variants').select('sku')
      .eq('id',createdVariantId).maybeSingle();
     setNotice('Variação criada com SKU '+(variantSku?.sku??'automático')+
      '. Acesse Estoque para registrar a entrada.');
    }else setNotice('Variação criada com SKU manual. Acesse Estoque para registrar a entrada.');
   }
   setVariantFor(null);setVariantEditingId(null);router.refresh();
  }catch(err){setError(err instanceof Error?err.message:'Falha ao criar variação.');}
  finally{setSaving(false);}
 }
 return <div className="container admin-workspace">
  <div className="admin-top"><div><div className="section-kicker">CATÁLOGO • POPÊ BEAUTY</div><h1>Produtos e variações 💄</h1><p>Cadastre maquiagens, cosméticos, cores, kits e acessórios.</p></div>
    <button type="button" className="admin-primary" onClick={startCreate}><PackagePlus size={19}/> Novo produto</button></div>
  <div className="admin-metric-row">
   <div><Tag/><small>Produtos cadastrados</small><strong>{metrics.all}</strong></div>
   <div><Check/><small>Ativos na vitrine</small><strong>{metrics.active}</strong></div>
   <div><Layers3/><small>SKUs / variações</small><strong>{metrics.variants}</strong></div>
   <div><AlertTriangle/><small>SKUs no mínimo</small><strong>{metrics.low}</strong></div>
  </div>
  {missingQuality>0?<p className="ops-info">
    <AlertTriangle size={18}/> {missingQuality} produto(s) ativo(s) precisam de foto,
    descrição, preço, SKU ou estoque.
    <button type="button" className="admin-outline"
     onClick={()=>setFilter('pendencias')}>Mostrar pendências</button>
   </p>:null}
  <div className="admin-filterbar"><label className="admin-search"><Search size={17}/><input placeholder="Buscar produto, marca ou SKU" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filtrar status"><option value="todos">Todos os produtos</option><option value="ativos">Ativos</option><option value="inativos">Rascunhos</option><option value="pendencias">Com pendências na vitrine</option></select>
    <Link className="admin-outline" href="/admin/categorias">
     <Tag size={16}/> Categorias</Link>
    <Link className="admin-outline" href="/admin/estoque"><Boxes size={17}/> Gestão de estoque</Link></div>
  {notice&&!open&&!variantFor?<div role="status" className="form-success">{notice}</div>:null}
  {error&&!open&&!variantFor?<div role="alert" className="form-error">{error}</div>:null}
  <div className="admin-data-table">
   <div className="admin-data-head"><span>Produto</span><span>Categoria</span><span>Preço / custo</span><span>SKUs / estoque</span><span>Status</span><span>Ações</span></div>
   {filtered.map(p=>{
    const amount=(p.variants??[]).reduce((a,v)=>a+(v.inventory?.on_hand??0),0);
    const quality=qualityById.get(p.id)??[];
    return <div className="admin-data-row" key={p.id}>
     <div className="admin-product-name"><div className="admin-product-thumb">{productImageSrc(p.image_url)?<img src={productImageSrc(p.image_url)!} alt=""/>:'💄'}</div><div><strong>{p.name}</strong><small>{p.brand}</small><small className="admin-tiny">{p.slug}</small>
      {quality.length?<small className="pope-product-issues">
       {quality.map(issue=>CATALOG_ISSUE_LABELS[issue]).join(' · ')}
      </small>:<small className="pope-product-issues is-complete">Cadastro conferido</small>}
     </div></div>
     <span className="admin-cell-muted">{p.categories?.name??'Sem categoria'}{p.is_adult?<small>🔒 Exclusivo +18</small>:null}</span>
     <span><strong>{formatBRL(p.price_cents)}</strong><small>Custo {formatBRL(p.cost_cents??0)}</small></span>
     <span><strong>{(p.variants??[]).length} SKU(s)</strong><small>{amount} un. em estoque</small></span>
     <span className={p.active?'admin-status live':'admin-status draft'}>{p.active?'Ativo':'Rascunho'}</span>
     <div className="admin-row-actions"><button aria-label={'Editar '+p.name} onClick={()=>startEdit(p)} title="Editar produto"><Edit3 size={17}/></button><button aria-label={'Adicionar variação a '+p.name} onClick={()=>openVariant(p)} title="Adicionar cor ou variação"><Plus size={18}/></button></div>
     <details className="admin-row-variants"><summary>Ver variações <ChevronDown size={15}/></summary>
      <div className="admin-variant-chips">{(p.variants??[]).map(v=><span key={v.id}>{v.sku} · {v.shade||v.name} · {v.inventory?.on_hand??0} un. <button className="variant-edit" title="Editar variação" onClick={()=>editVariant(p,v)}><Edit3 size={13}/> Editar</button></span>)}</div>
     </details>
    </div>;
   })}
   {filtered.length===0?<div className="admin-empty"><PackagePlus size={32}/><h3>Nenhum produto encontrado</h3><p>Comece cadastrando o primeiro item do catálogo.</p><button className="admin-primary" onClick={startCreate}>Cadastrar produto</button></div>:null}
  </div>
  {open?<div className="admin-modal-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setOpen(false);}}>
    <section className="admin-modal" role="dialog" aria-modal="true" aria-label={editing?'Editar produto':'Novo produto'}>
     <div className="admin-modal-header"><div><span className="section-kicker">CATÁLOGO</span><h2>{editing?'Editar produto':'Novo produto'} 💖</h2></div><button aria-label="Fechar" onClick={()=>setOpen(false)} disabled={saving}><X/></button></div>
     <form className="admin-form" onSubmit={save}>
      <div className="pope-product-guided">
       <strong>Cadastro orientado</strong>
       <span>1. Identificação → 2. Preços e fotografia → 3. Estoque e publicação</span>
       <p>Salve como rascunho durante o preenchimento.
        Confira também as dimensões e a tributação antes da produção.</p>
      </div>
      <div className="pope-product-step" aria-label={'Etapa '+formStep+' de 3'}>
       <strong>Etapa {formStep} de 3</strong>
       <span>{formStep===1?'Identificação e descrição':
        formStep===2?'Preços e fotografia':'SKU, estoque e publicação'}</span>
      </div>
      {formStep===1?<div className="admin-form-grid">
       <label className="full">Nome do produto *<input required maxLength={150} value={form.name} onChange={e=>{change('name',e.target.value);if(!editing&&!form.slug)setForm(f=>({...f,name:e.target.value,slug:slugify(e.target.value)}));}} placeholder="Ex.: Base Líquida Alta Cobertura"/></label>
       <label>Categoria *<select value={form.category_id} disabled={!!editing} onChange={e=>{const next=e.target.value;const oldAdult=!!categories.find(c=>c.id===form.category_id)?.is_adult;const newAdult=!!categories.find(c=>c.id===next)?.is_adult;setForm(f=>({...f,category_id:next,image_url:oldAdult!==newAdult?'':f.image_url}));setFile(null);}} required><option value="">Selecionar...</option>{categories.filter(c=>!c.parent_id).map(parent=>
        <optgroup key={parent.id} label={parent.name}>
         <option value={parent.id} disabled={parent.active===false}>{parent.is_adult?'🔒 ':''}{parent.name} (principal){parent.active===false?' (desativada)':''}</option>
         {categories.filter(c=>c.parent_id===parent.id).map(child=>
          <option key={child.id} value={child.id} disabled={child.active===false||parent.active===false}>
           {child.is_adult?'🔒 ':''}↳ {child.name}
          </option>)}
        </optgroup>)}</select></label>
       <p className="admin-help full">Precisa de uma nova categoria?
        <Link href="/admin/categorias"> Gerenciar categorias e subcategorias</Link>.</p>
       <label>Marca<input value={form.brand} onChange={e=>change('brand',e.target.value)} maxLength={100}/></label>
       <label className="full">Endereço (slug)<input required disabled={!!editing} value={form.slug} onChange={e=>change('slug',slugify(e.target.value))} placeholder="base-liquida-alta-cobertura"/></label>
       <label className="full">Descrição<textarea rows={3} value={form.description} onChange={e=>change('description',e.target.value)} placeholder="Descrição para a vitrine, benefícios e informações importantes"/></label>
      </div>:null}
      {formStep===2?<div className="admin-form-grid">
       <label>Preço de venda (R$) *<input inputMode="decimal" required placeholder="29,90" value={form.price} onChange={e=>change('price',e.target.value)}/></label>
       <label>Custo unitário (R$) *<input inputMode="decimal" required value={form.cost} onChange={e=>change('cost',e.target.value)}/></label>
       <label>Preço anterior (R$)<input inputMode="decimal" placeholder="Opcional" value={form.compare} onChange={e=>change('compare',e.target.value)}/></label>
       {isAdultCategory?<p className="adult-admin-note">🔒 Este produto será ocultado para visitantes e menores de idade. A foto ficará em armazenamento privado.</p>:null}
       <label className="full admin-file-label"><Camera size={19}/> {isAdultCategory?'Foto privada +18':'Foto do produto'} (JPG, PNG, WebP; até 5 MB)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile}/>{file?<small>{file.name}</small>:null}</label>
       {!isAdultCategory?<label className="full">Ou URL da foto<input type="url" placeholder="https://..." disabled={!!file} value={form.image_url} onChange={e=>change('image_url',e.target.value)}/></label>:null}
      </div>:null}
      {formStep===3?<div className="admin-form-grid">
       <label className="admin-form-check"><input type="checkbox" checked={form.active} onChange={e=>change('active',e.target.checked)}/> Publicar na vitrine</label>
       {form.active&&((!file&&!form.image_url.trim())||form.description.trim().length<60)?
        <p className="pope-product-warn full" role="status">
         Atenção: produto marcado para publicação com
         {(!file&&!form.image_url.trim())?' foto ausente':''}
         {(!file&&!form.image_url.trim())&&form.description.trim().length<60?' e':''}
         {form.description.trim().length<60?' descrição curta':''}.
         Para uma vitrine completa, corrija antes de publicar.
        </p>:null}

       </div>:null}
      {formStep===3?(!editing?<><h3>SKU e estoque inicial</h3><p className="admin-help">Cada cor ou apresentação possui SKU único. O código POP é
       gerado automaticamente ao salvar, sem precisar preencher o campo.
       O código de barras EAN é independente do SKU interno.</p>
      <div className="admin-form-grid">
       <label>SKU (opcional)
        <input value={form.sku} maxLength={80} placeholder="Automático: POP-0000001"
         onChange={e=>change('sku',e.target.value)}/>
        <small>Deixe vazio para gerar um código único ao salvar. Ou digite um SKU manual.</small>
       </label>
       <label>Nome da variação<input value={form.variant_name} maxLength={100} onChange={e=>change('variant_name',e.target.value)} placeholder="Padrão / Cor 01"/></label>
       <label>Cor / tonalidade<input value={form.shade} maxLength={100} onChange={e=>change('shade',e.target.value)} placeholder="Nude médio"/></label>
       <label>EAN / código de barras<input value={form.ean} maxLength={32} onChange={e=>change('ean',e.target.value)} placeholder="789..."/></label>
       <label>Estoque inicial<input type="number" min={0} max={100000} step={1} value={form.stock} onChange={e=>change('stock',e.target.value)}/></label>
       <label>Estoque de segurança<input type="number" min={0} max={100000} step={1} value={form.safety_stock} onChange={e=>change('safety_stock',e.target.value)}/></label>
       <label>Lote<input value={form.lot_code} maxLength={60} onChange={e=>change('lot_code',e.target.value)} placeholder="LOT-2026-A"/></label>
       <label>Validade do lote<input type="date" value={form.expires_at} onChange={e=>change('expires_at',e.target.value)}/></label>
      </div></>:<p className="admin-help">Para alterar o estoque, use a tela de movimentações; para incluir outra cor, clique em + na lista de produtos.</p>):null}
      {formStep===3?<p className="admin-help">Revisão final: salve como rascunho
       ou publique conscientemente. Foto, descrição, SKU e estoque pendentes
       continuam destacados na administração.</p>:null}
      {error?<p className="form-error" role="alert">{error}</p>:null}
      <div className="admin-form-footer"><button type="button" className="admin-outline" onClick={()=>setOpen(false)} disabled={saving}>Cancelar</button>
       {formStep>1?<button type="button" className="admin-outline"
        onClick={()=>{setError('');setFormStep((formStep-1) as 1|2|3);}} disabled={saving}>Anterior</button>:null}
       {formStep<3?<button type="button" className="admin-primary"
        onClick={advanceProductForm} disabled={saving}>Próxima etapa</button>:
        <button type="submit" className="admin-primary" disabled={saving}>
         {saving?'Salvando...':editing?'Salvar alterações':'Cadastrar produto'}</button>}</div>
     </form>
    </section></div>:null}
  {variantFor?<div className="admin-modal-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setVariantFor(null);}}>
    <section className="admin-modal smaller" role="dialog" aria-modal="true" aria-label="Adicionar variação"><div className="admin-modal-header"><div><span className="section-kicker">{variantFor.name}</span><h2>{variantEditingId?'Editar variação':'Nova cor ou variação'} 🎨</h2></div><button aria-label="Fechar" onClick={()=>setVariantFor(null)}><X/></button></div>
     <form className="admin-form" onSubmit={saveVariant}><div className="admin-form-grid">
      <label>{variantEditingId?'SKU atual *':'SKU (opcional)'}
       <input value={vSku} required={!!variantEditingId} maxLength={80}
        onChange={e=>setVSku(e.target.value)}
        placeholder={variantEditingId?'SKU atual':'Automático ao salvar'}/>
       <small>{variantEditingId?'SKU da variação existente.':'Deixe vazio para gerar POP-0000001, POP-0000002...'}</small>
      </label>
      <label>Nome da variação<input value={vName} onChange={e=>setVName(e.target.value)}/></label>
      <label>Tonalidade<input value={vShade} onChange={e=>setVShade(e.target.value)} placeholder="Rosa médio"/></label>
      <label>EAN<input value={vEan} onChange={e=>setVEan(e.target.value)}/></label>
      <label>Estoque de segurança<input type="number" min={0} max={100000} value={vSafety} onChange={e=>setVSafety(e.target.value)}/></label>
     </div><p className="admin-help">{variantEditingId?'A edição não modifica a quantidade em estoque. Para alterar o saldo, utilize Estoque.':'Esta nova variação será criada com saldo zero. Faça a primeira entrada pela tela de estoque.'}</p>
     {error?<p className="form-error" role="alert">{error}</p>:null}
     <div className="admin-form-footer"><button type="button" className="admin-outline" onClick={()=>setVariantFor(null)}>Cancelar</button><button type="submit" className="admin-primary" disabled={saving}>{saving?'Salvando...':variantEditingId?'Salvar variação':'Adicionar variação'}</button></div>
     </form>
    </section></div>:null}
 </div>;
}
