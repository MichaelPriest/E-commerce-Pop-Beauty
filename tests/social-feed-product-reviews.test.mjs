import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 validateFeedPost,feedMediaInfo,feedPage,feedCategoryIds
} from '../src/lib/feed-core.ts';
import {validateProductReview,starsOf} from '../src/lib/product-reviews-core.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('texto e mídia do feed usam limites explícitos',()=>{
 assert.equal(validateFeedPost('Tutorial de maquiagem',null),null);
 assert.equal(validateFeedPost('',{type:'image/jpeg',size:1024}),null);
 assert.match(validateFeedPost('',null),/Inclua/);
 assert.match(validateFeedPost('x'.repeat(2001),null),/2.000/);
 assert.equal(feedMediaInfo({type:'image/webp',size:512})?.kind,'image');
 assert.equal(feedMediaInfo({type:'video/mp4',size:3*1024*1024})?.kind,'video');
 assert.match(feedMediaInfo({type:'video/mp4',size:26*1024*1024})?.error??'',/25 MB/);
 assert.match(feedMediaInfo({type:'image/gif',size:512})?.error??'',/JPG/);
});
test('paginação e categorias cobrem pai e subcategoria',()=>{
 assert.equal(feedPage('2'),2);
 assert.equal(feedPage('-1'),1);
 assert.equal(feedPage('abc'),1);
 assert.deepEqual(feedCategoryIds('a',[
  {id:'a',name:'A',slug:'a',parent_id:null,active:true,is_adult:false},
  {id:'b',name:'B',slug:'b',parent_id:'a',active:true,is_adult:false},
  {id:'c',name:'C',slug:'c',parent_id:null,active:true,is_adult:false}
 ]),['a','b']);
});
test('avaliações de produto exigem 1 a 5 estrelas e comentário completo',()=>{
 assert.equal(validateProductReview(5,'Excelente produto, qualidade perfeita.'),null);
 assert.match(validateProductReview(0,'Bom produto, gostei dele.'),/1 a 5/);
 assert.match(validateProductReview(6,'Bom produto, gostei dele.'),/1 a 5/);
 assert.match(validateProductReview(4,'Curto'),/10 e 1.200/);
 assert.match(validateProductReview(4,'x'.repeat(1201)),/10 e 1.200/);
 assert.equal(starsOf(3),'★★★☆☆');
 assert.equal(starsOf(4.6),'★★★★★');
});
test('somente equipe Popê pode publicar no feed ou enviar mídias',()=>{
 const sql=read('supabase/social_feed_v1.sql');
 assert.match(sql,/function private\.is_feed_editor\(\)/);
 assert.match(sql,/p\.role in \('admin','staff'\)/);
 assert.match(sql,/feed_posts_create[\s\S]*?\(select private\.is_feed_editor\(\)\)/);
 assert.match(sql,/pope_feed_upload_owner[\s\S]*?\(select private\.is_feed_editor\(\)\)/);
 assert.match(sql,/alter table public\.feed_posts enable row level security/);
 assert.match(sql,/status='published'/);
 assert.match(sql,/not p\.is_adult/);
 assert.match(sql,/storage\.buckets/);
 assert.match(sql,/public=false/);
 assert.doesNotMatch(sql,/grant insert\(.*\) on public\.feed_posts to anon/);
 assert.doesNotMatch(sql,/feed_post_likes/);
 const publicFeed=read('src/app/feed/page.tsx');
 assert.doesNotMatch(publicFeed,/\/feed\/criar|\/feed\/minhas|<FeedComposer/);
 assert.match(publicFeed,/Novidades, vídeos, inspirações e tutoriais publicados pela equipe Popê/);
 const access=read('src/lib/feed-access.ts');
 assert.match(access,/\['admin','staff'\]/);
 assert.match(read('src/components/team-feed-workspace.tsx'),/requireFeedEditor/);
 const composer=read('src/components/feed-composer.tsx');
 assert.doesNotMatch(composer,/admin\?|\/feed\/criar/);
});
test('avaliações públicas dependem de moderação e não há compras verificadas presumidas',()=>{
 const sql=read('supabase/product_reviews_v1.sql');
 assert.match(sql,/alter table public\.product_reviews enable row level security/);
 assert.match(sql,/unique\(product_id,user_id\)/);
 assert.match(sql,/status='pending'/);
 assert.match(sql,/product_reviews_team_moderation/);
 assert.match(sql,/user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/not p\.is_adult/);
 assert.match(sql,/security invoker/);
 assert.match(sql,/product_review_summary/);
 const productPage=read('src/app/produto/[slug]/page.tsx');
 assert.match(productPage,/<ProductReviews/);
 assert.match(productPage,/product\.is_adult/);
 assert.match(productPage,/feed\?produto=/);
 const reviewForm=read('src/components/product-reviews.tsx');
 assert.match(reviewForm,/\.from\('product_reviews'\)\.insert\(/);
 assert.match(reviewForm,/status:'pending'/);
 assert.match(read('src/components/team-reviews-workspace.tsx'),/requireFeedEditor/);
});
test('rotas de gestão e feed estão integradas à navegação',()=>{
 const sidebar=read('src/components/admin-shell.tsx');
 assert.match(sidebar,/href:'\/admin\/feed'/);
 assert.match(sidebar,/href:'\/admin\/avaliacoes'/);
 const store=read('src/components/header.tsx');
 assert.match(store,/href="\/feed"/);
 const account=read('src/app/conta/page.tsx');
 assert.match(account,/href="\/equipe\/feed"/);
 assert.match(account,/href="\/equipe\/avaliacoes"/);
});
