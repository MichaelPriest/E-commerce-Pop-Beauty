'use client';
import {useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import {CheckCircle2,EyeOff,Clock,Search,ShieldAlert} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {FEED_POST_STATUSES,type FeedPostView,type FeedStatus} from '@/lib/feed-core';
import {FeedCard} from '@/components/feed-card';

export function FeedManager({posts,userId}:{
 posts:FeedPostView[];userId:string;
}){
 const router=useRouter();
 const [filter,setFilter]=useState('all'),[query,setQuery]=useState('');
 const [saving,setSaving]=useState<string|null>(null),[error,setError]=useState('');
 const visible=useMemo(()=>posts.filter(post=>
  (filter==='all'||post.status===filter)&&
  [post.body,post.author_name,post.product?.name??'',post.category?.name??'']
   .join(' ').toLocaleLowerCase('pt-BR')
   .includes(query.trim().toLocaleLowerCase('pt-BR'))
 ),[posts,filter,query]);
 async function change(id:string,status:FeedStatus){
  if(saving)return;
  setSaving(id);setError('');
  const {data,error:dbError}=await createClient().from('feed_posts')
   .update({status}).eq('id',id).select('id').maybeSingle();
  if(dbError||!data)setError('Não foi possível alterar a visibilidade da publicação.');
  else router.refresh();
  setSaving(null);
 }
 return <section className="pope-feed-manager">
  <div className="pope-feed-manager-top">
   <h2>Gerenciar publicações <small>({posts.length} recentes)</small></h2>
   <div className="pope-feed-manager-filters">
    <label><Search size={17}/><input aria-label="Buscar publicações"
     placeholder="Buscar texto ou produto" value={query}
     onChange={e=>setQuery(e.target.value)}/></label>
    <select value={filter} onChange={e=>setFilter(e.target.value)}
     aria-label="Filtrar publicações">
     <option value="all">Todas</option>
     {Object.entries(FEED_POST_STATUSES).map(([key,label])=>
      <option value={key} key={key}>{label}</option>)}
    </select>
   </div>
  </div>
  {error?<p role="alert" className="form-error">{error}</p>:null}
  {visible.length?<div className="pope-feed-list">
   {visible.map(post=><div key={post.id} className="pope-feed-management-item">
    <FeedCard post={post} userId={userId} moderation/>
    <div className="pope-feed-moderation-actions">
     {post.status!=='published'?<button className="admin-primary" type="button"
      disabled={!!saving} onClick={()=>change(post.id,'published')}>
       <CheckCircle2 size={16}/> Publicar
      </button>:null}
     {post.status!=='hidden'?<button className="admin-outline" type="button"
      disabled={!!saving} onClick={()=>change(post.id,'hidden')}>
       <EyeOff size={16}/> Ocultar
      </button>:null}
     {post.status!=='pending'?<button className="admin-outline" type="button"
      disabled={!!saving} onClick={()=>change(post.id,'pending')}>
       <Clock size={16}/> Enviar para revisão
      </button>:null}
     {post.status!=='rejected'?<button className="admin-outline" type="button"
      disabled={!!saving} onClick={()=>change(post.id,'rejected')}>
       <ShieldAlert size={16}/> Não aprovar
      </button>:null}
    </div>
   </div>)}
  </div>:<div className="pope-feed-empty">Nenhuma publicação neste filtro.</div>}
 </section>;
}
