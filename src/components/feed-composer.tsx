'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {ImagePlus,Video,Send,Tags,PackageSearch,X} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {
 feedMediaInfo,validateFeedPost,FEED_BODY_MAX,
 type FeedCategory,type FeedProduct
} from '@/lib/feed-core';

export function FeedComposer({userId,categories,products}:{
 userId:string;
 categories:FeedCategory[];products:FeedProduct[];
}){
 const router=useRouter();
 const [body,setBody]=useState(''),[file,setFile]=useState<File|null>(null);
 const [preview,setPreview]=useState('');
 const [categoryId,setCategoryId]=useState(''),[productId,setProductId]=useState('');
 const [publish,setPublish]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{
  if(!file){setPreview('');return;}
  const url=URL.createObjectURL(file);setPreview(url);
  return ()=>URL.revokeObjectURL(url);
 },[file]);
 const media=feedMediaInfo(file);
 const productsFiltered=categoryId?products.filter(p=>{
  if(p.category_id===categoryId)return true;
  const parent=categories.find(c=>c.id===p.category_id)?.parent_id;
  return parent===categoryId;
 }):products;
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(saving)return;
  const validation=validateFeedPost(body,file);
  if(validation){setError(validation);return;}
  if(productId&&!productsFiltered.some(p=>p.id===productId)){
   setError('O produto escolhido não pertence à categoria selecionada.');return;
  }
  setSaving(true);setError('');setMessage('');
  const db=createClient();
  let uploadedPath:string|null=null;
  try{
   if(file){
    if(!media||'error' in media)throw Error('Arquivo inválido.');
    uploadedPath=userId+'/'+crypto.randomUUID()+'.'+media.ext;
    const {error:uploadError}=await db.storage.from('pope-feed-media')
     .upload(uploadedPath,file,{contentType:file.type,upsert:false});
    if(uploadError)throw new Error('Falha ao enviar a mídia. Confira o formato, tamanho e sua conexão.');
   }
   const {error:postError}=await db.from('feed_posts').insert({
    author_id:userId,body:body.trim(),media_path:uploadedPath,
    media_kind:media&&'kind' in media?media.kind:null,
    category_id:categoryId||null,product_id:productId||null,
    status:publish?'published':'pending'
   });
   if(postError){
    if(postError.message.includes('trinta postagens'))throw new Error(
     'Limite de 30 postagens nas últimas 24 horas.');
    throw new Error('Não foi possível salvar a postagem. Verifique os vínculos e tente novamente.');
   }
   setBody('');setFile(null);setCategoryId('');setProductId('');
   setMessage(publish?'Postagem publicada no feed.':'Rascunho enviado à fila de revisão.');
   router.refresh();
  }catch(e){
   if(uploadedPath)await db.storage.from('pope-feed-media').remove([uploadedPath]);
   setError(e instanceof Error?e.message:'Erro ao enviar publicação.');
  }finally{setSaving(false);}
 }
 return <section className="pope-feed-compose" aria-label="Criar postagem">
  <div className="pope-feed-compose-head">
   <div><h2>Publicar no feed da Popê</h2>
    <p>Texto, foto ou vídeo. Relacione uma publicação a produtos ou seções da loja.</p></div>
   <ImagePlus size={29} aria-hidden="true"/>
  </div>
  <form onSubmit={submit}>
   <label htmlFor="pope-feed-text">Sua postagem</label>
   <textarea id="pope-feed-text" rows={4} maxLength={FEED_BODY_MAX}
    placeholder="Dica de beleza, lançamento, tutorial, experiência com um produto..."
    value={body} disabled={saving} onChange={e=>setBody(e.target.value)}/>
   <small className="pope-feed-counter">{body.length}/{FEED_BODY_MAX} caracteres</small>
   <div className="pope-feed-attach">
    <label htmlFor="pope-feed-file"><ImagePlus size={18}/><Video size={18}/>
     Adicionar foto ou vídeo
    </label>
    <input type="file" id="pope-feed-file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
     disabled={saving} onChange={e=>{
      const selected=e.target.files?.[0]??null;
      setFile(selected);setError('');
     }}/>
    <small>Imagens até 5 MB · Vídeos MP4/WebM até 25 MB · 1 arquivo</small>
   </div>
   {file?<div className="pope-feed-preview">
    {preview&&media&&'kind' in media?
     media.kind==='image'?<img src={preview} alt="Prévia da imagem escolhida"/>:
      <video src={preview} controls preload="metadata" playsInline aria-label="Prévia do vídeo escolhido"/>:null}
    <div><strong>{file.name}</strong><small>{(file.size/1024/1024).toFixed(1)} MB</small></div>
    <button type="button" onClick={()=>setFile(null)} disabled={saving}
     aria-label="Remover arquivo"><X size={18}/></button>
   </div>:null}
   <div className="pope-feed-relationships">
    <label><Tags size={16}/> Categoria / subcategoria
     <select value={categoryId} disabled={saving} onChange={e=>{
      setCategoryId(e.target.value);setProductId('');
     }}>
      <option value="">Sem categoria específica</option>
      {categories.map(c=><option value={c.id} key={c.id}>
       {c.parent_id?categories.find(p=>p.id===c.parent_id)?.name+' / ':''}{c.name}
      </option>)}
     </select>
    </label>
    <label><PackageSearch size={16}/> Produto relacionado
     <select value={productId} disabled={saving} onChange={e=>{
      const id=e.target.value;setProductId(id);
      if(id&&!categoryId){setCategoryId(products.find(p=>p.id===id)?.category_id??'');}
     }}>
      <option value="">Sem produto específico</option>
      {productsFiltered.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}
     </select>
    </label>
   </div>
   <label className="pope-feed-publish-check">
    <input type="checkbox" checked={publish} disabled={saving}
     onChange={e=>setPublish(e.target.checked)}/>
    Publicar imediatamente (desmarque para revisão)
   </label>
   {error?<p className="form-error" role="alert">{error}</p>:null}
   {message?<p className="form-success" role="status">{message}</p>:null}
   <button type="submit" className="admin-primary" disabled={saving}>
    <Send size={18}/>{saving?'Enviando...':'Salvar publicação'}
   </button>
  </form>
 </section>;
}
