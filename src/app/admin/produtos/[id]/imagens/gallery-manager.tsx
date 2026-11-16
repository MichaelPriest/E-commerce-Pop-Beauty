'use client';
import {useState,type ChangeEvent} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {
 ArrowLeft,ArrowUp,ArrowDown,Camera,ImagePlus,Trash2,Save
} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {productImageSrc} from '@/lib/products';

export type GalleryPhoto={
 id:string;storage_path:string;alt_text:string;sort_order:number;
 created_at:string;url:string
};
type Props={
 product:{id:string;name:string;slug:string;image_url:string|null;active:boolean};
 photos:GalleryPhoto[]
};
export function GalleryManager({product,photos}:Props){
 const router=useRouter();
 const [files,setFiles]=useState<File[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[message,setMessage]=useState('');
 const [alt,setAlt]=useState<Record<string,string>>(
  Object.fromEntries(photos.map(x=>[x.id,x.alt_text]))
 );
 const remaining=Math.max(0,8-photos.length);
 const cover=productImageSrc(product.image_url);
 async function upload(){
  if(busy||!files.length)return;
  if(files.length>remaining){
   setError('Selecione no máximo '+remaining+' foto(s) adicionais.');return;
  }
  setBusy(true);setError('');setMessage('');
  const sb=createClient();
  let succeeded=0;
  try{
   for(const file of files){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||
      file.size>5*1024*1024||file.size<100){
     throw new Error('Use arquivos JPG, PNG ou WebP entre 100 bytes e 5 MB.');
    }
    const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
    const storage_path='products/gallery/'+product.id+'/'+crypto.randomUUID()+'.'+ext;
    const {error:uploadError}=await sb.storage.from('product-images')
     .upload(storage_path,file,{contentType:file.type,upsert:false});
    if(uploadError)throw uploadError;
    const {error:dbError}=await sb.from('product_gallery_images').insert({
     product_id:product.id,storage_path,alt_text:file.name.replace(/\.[^.]+$/,'')
      .slice(0,160),sort_order:photos.length+succeeded
    });
    if(dbError){
     await sb.storage.from('product-images').remove([storage_path]);
     throw dbError;
    }
    succeeded++;
   }
   setMessage(succeeded+' foto(s) cadastrada(s).');
   setFiles([]);router.refresh();
  }catch(e){
   setError((e instanceof Error?e.message:'Falha no envio.')+
    (succeeded?' '+succeeded+' foto(s) foram salvas.':''));
   if(succeeded)router.refresh();
  }finally{setBusy(false);}
 }
 async function saveAlt(photo:GalleryPhoto){
  if(busy)return;
  setBusy(true);setError('');setMessage('');
  const value=(alt[photo.id]??'').trim().slice(0,160);
  try{
   const {error:rpcError}=await createClient().from('product_gallery_images')
    .update({alt_text:value}).eq('id',photo.id).eq('product_id',product.id);
   if(rpcError)throw rpcError;
   setMessage('Descrição da foto atualizada.');router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar a descrição.');}
  finally{setBusy(false);}
 }
 async function move(index:number,direction:number){
  const next=index+direction;
  if(busy||next<0||next>=photos.length)return;
  setBusy(true);setError('');setMessage('');
  const order=photos.map(x=>x.id);
  [order[index],order[next]]=[order[next],order[index]];
  try{
   const {error:rpcError}=await createClient().rpc('reorder_product_gallery',{
    p_product_id:product.id,p_image_ids:order
   });
   if(rpcError)throw rpcError;
   setMessage('Ordem das fotos atualizada.');router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível reorganizar as fotos.');}
  finally{setBusy(false);}
 }
 async function remove(photo:GalleryPhoto){
  if(busy||!window.confirm('Remover esta foto da galeria? A ação não altera a foto principal.'))return;
  setBusy(true);setError('');setMessage('');
  const sb=createClient();
  try{
   const {error:dbError}=await sb.from('product_gallery_images').delete()
    .eq('id',photo.id).eq('product_id',product.id);
   if(dbError)throw dbError;
   const {error:storageError}=await sb.storage.from('product-images')
    .remove([photo.storage_path]);
   setMessage(storageError?
    'Foto removida da galeria, mas houve falha ao limpar o arquivo do armazenamento.':
    'Foto removida da galeria.');
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Falha ao remover a foto.');}
  finally{setBusy(false);}
 }
 function choose(event:ChangeEvent<HTMLInputElement>){
  const selected=Array.from(event.target.files??[]);
  setError('');
  if(selected.length>remaining){
   setError('Restam apenas '+remaining+' espaços na galeria.');setFiles([]);return;
  }
  setFiles(selected);
 }
 return <div className="container admin-workspace pope-gallery-admin">
  <div className="admin-top">
   <div>
    <div className="section-kicker">POPÊ BEAUTY • CATÁLOGO</div>
    <h1><Camera size={27}/> Fotos do produto</h1>
    <p>{product.name} · Até oito fotos adicionais além da capa.</p>
   </div>
   <Link className="admin-outline" href="/admin/produtos">
    <ArrowLeft size={16}/> Voltar aos produtos</Link>
  </div>
  <div className="pope-gallery-intro">
   <div className="pope-gallery-cover">
    {cover?<img src={cover} alt="Foto principal do produto"/>:
     <span><Camera size={31}/> Sem capa</span>}
   </div>
   <div>
    <h2>Foto principal</h2>
    <p>Esta foto aparece na vitrine e será a primeira imagem do produto.
     Para alterá-la, use <strong>Editar produto → Preços e fotografia</strong>.</p>
    <Link className="admin-outline" href="/admin/produtos">
     Editar informações e capa</Link>
    {product.active?<Link className="admin-outline"
      href={'/produto/'+product.slug}>Ver produto na loja</Link>:null}
   </div>
  </div>
  <section className="ops-form-card">
   <h2><ImagePlus size={20}/> Fotos adicionais ({photos.length}/8)</h2>
   <p className="admin-help">Use imagens nítidas e originais do produto,
    mostrando cores, embalagem, textura e detalhes. JPG, PNG ou WebP, até 5 MB cada.
    As imagens adicionadas aqui são públicas. Para produtos +18, utilize exclusivamente
    o cadastro privado já existente.</p>
   <div className="pope-gallery-upload">
    <label>Selecionar fotos
     <input type="file" multiple accept="image/jpeg,image/png,image/webp"
      disabled={busy||remaining===0} onChange={choose}/>
    </label>
    <button type="button" className="admin-primary"
     onClick={()=>void upload()} disabled={busy||!files.length||remaining===0}>
     <ImagePlus size={18}/> {busy?'Enviando...':
      'Adicionar '+(files.length||'')+' foto(s)'}
    </button>
   </div>
   {remaining===0?<p className="admin-help">Limite atingido. Remova uma foto
    adicional antes de incluir outra.</p>:null}
   {error?<p className="form-error" role="alert">{error}</p>:null}
   {message?<p className="form-success" role="status">{message}</p>:null}
   {photos.length?<div className="pope-gallery-grid">
    {photos.map((photo,index)=><article key={photo.id} className="pope-gallery-card">
     <div className="pope-gallery-image">
      <img src={photo.url} alt={photo.alt_text||'Foto adicional'} loading="lazy"/>
      <span>Foto {index+2}</span>
     </div>
     <label>Descrição da foto
      <input value={alt[photo.id]??''} maxLength={160}
       onChange={e=>setAlt(x=>({...x,[photo.id]:e.target.value}))}
       disabled={busy}/>
     </label>
     <div className="pope-gallery-actions">
      <button type="button" className="admin-outline" disabled={busy}
       onClick={()=>void saveAlt(photo)} title="Salvar descrição">
       <Save size={15}/> Salvar</button>
      <button type="button" className="admin-outline" disabled={busy||index===0}
       onClick={()=>void move(index,-1)} title="Mover foto para cima"
       aria-label={'Mover foto '+(index+2)+' para cima'}><ArrowUp size={17}/></button>
      <button type="button" className="admin-outline"
       disabled={busy||index===photos.length-1}
       onClick={()=>void move(index,1)} title="Mover foto para baixo"
       aria-label={'Mover foto '+(index+2)+' para baixo'}><ArrowDown size={17}/></button>
      <button type="button" className="admin-outline" disabled={busy}
       onClick={()=>void remove(photo)} title="Remover foto"
       aria-label={'Remover foto '+(index+2)}><Trash2 size={17}/></button>
     </div>
    </article>)}
   </div>:<div className="admin-empty">
    <Camera size={32}/><h3>Nenhuma foto adicional cadastrada</h3>
    <p>Selecione arquivos para começar sua galeria.</p>
   </div>}
  </section>
 </div>;
}
