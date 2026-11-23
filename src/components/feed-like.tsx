'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {Heart} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';

export function FeedLike({postId,userId,count,liked}:{
 postId:string;userId:string|null;count:number;liked:boolean;
}){
 const router=useRouter();
 const [active,setActive]=useState(liked),[total,setTotal]=useState(count);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function toggle(){
  if(!userId||busy)return;
  setBusy(true);setError('');
  const previous=active;
  setActive(!previous);setTotal(v=>Math.max(0,v+(previous?-1:1)));
  const sb=createClient();
  const {error:dbError}=previous?
   await sb.from('feed_post_likes').delete().eq('post_id',postId).eq('user_id',userId):
   await sb.from('feed_post_likes').insert({post_id:postId,user_id:userId});
  if(dbError){
   setActive(previous);setTotal(count);
   setError('Não foi possível atualizar a curtida.');
  }else router.refresh();
  setBusy(false);
 }
 if(!userId)return <Link href="/entrar" className="pope-feed-like"
  title="Entre na conta para curtir"><Heart size={19}/>{total} curtidas</Link>;
 return <div className="pope-feed-like-holder">
  <button type="button" className={'pope-feed-like'+(active?' is-liked':'')}
   disabled={busy} onClick={toggle} aria-pressed={active}
   aria-label={active?'Remover curtida':'Curtir postagem'}>
   <Heart size={19} fill={active?'currentColor':'none'}/>
   {total} {total===1?'curtida':'curtidas'}
  </button>
  {error?<small role="alert">{error}</small>:null}
 </div>;
}
