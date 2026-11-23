import Link from 'next/link';
import {ArrowLeft,Clapperboard,ShieldCheck} from 'lucide-react';
import {requireFeedEditor} from '@/lib/feed-access';
import {feedTargets,FEED_POST_COLUMNS,feedPostViews,feedRows} from '@/lib/feed-server';
import {FeedComposer} from '@/components/feed-composer';
import {FeedManager} from '@/components/feed-manager';

export async function TeamFeedWorkspace(){
 const {db,userId,role}=await requireFeedEditor();
 const [targets,postsResult]=await Promise.all([
  feedTargets(db),
  db.from('feed_posts').select(FEED_POST_COLUMNS)
   .order('created_at',{ascending:false}).limit(80)
 ]);
 const posts=await feedPostViews(db,feedRows(postsResult.data));
 return <div className="container admin-workspace pope-feed-team">
  <div className="admin-top">
   <div><div className="section-kicker">POPÊ BEAUTY • CONTEÚDO OFICIAL</div>
    <h1><Clapperboard size={27}/> Feed e publicações</h1>
    <p>Crie posts de texto, imagem ou vídeo, associados a produtos e categorias.
     Apenas a equipe Popê pode publicar.</p>
   </div>
   <div className="pope-feed-team-actions">
    <Link className="admin-outline" href="/feed">Visualizar feed</Link>
    <Link className="admin-outline" href={role==='admin'?'/admin':'/conta'}>
     <ArrowLeft size={16}/> Voltar
    </Link>
   </div>
  </div>
  <div className="pope-feed-team-note">
   <ShieldCheck size={19}/> As postagens são oficiais da equipe.
   O cliente pode curtir posts e avaliar produtos em suas páginas.
  </div>
  {targets.error||postsResult.error?<p className="form-error" role="alert">
   Falha ao carregar o módulo. Confira a migração social_feed_v1.sql.
  </p>:<>
   <FeedComposer userId={userId} categories={targets.categories}
    products={targets.products}/>
   <FeedManager posts={posts} userId={userId}/>
  </>}
 </div>;
}
