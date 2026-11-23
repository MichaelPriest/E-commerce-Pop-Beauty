import {createClient} from '@/lib/supabase/server';
import type {
 FeedPost,FeedPostView,FeedProduct,FeedCategory
} from '@/lib/feed-core';

export type FeedDatabase=Awaited<ReturnType<typeof createClient>>;
type FeedRow=FeedPost&{
 products:(FeedProduct&{active:boolean;is_adult:boolean})|null;
 categories:(FeedCategory)|null;
};
export const FEED_POST_COLUMNS=
 'id,author_id,author_name,body,media_path,media_kind,product_id,category_id,status,like_count,created_at,updated_at,published_at,products(id,name,slug,category_id,price_cents,image_url,active,is_adult),categories(id,name,slug,parent_id,active,is_adult)';

export async function feedTargets(db:FeedDatabase){
 const [categoryResult,productResult]=await Promise.all([
  db.from('categories').select('id,name,slug,parent_id,active,is_adult')
   .eq('active',true).eq('is_adult',false).order('name').limit(300),
  db.from('products').select('id,name,slug,category_id,price_cents,image_url')
   .eq('active',true).eq('is_adult',false).order('name').limit(300)
 ]);
 return {
  categories:(categoryResult.data??[]) as FeedCategory[],
  products:(productResult.data??[]) as FeedProduct[],
  error:categoryResult.error||productResult.error
 };
}
export async function feedPostViews(db:FeedDatabase,rows:FeedRow[]):Promise<FeedPostView[]>{
 return Promise.all(rows.map(async(row)=>{
  let media_url:string|null=null;
  if(row.media_path){
   const result=await db.storage.from('pope-feed-media')
    .createSignedUrl(row.media_path,45*60);
   media_url=result.data?.signedUrl??null;
  }
  const {products,categories,...post}=row;
  return {
   ...post,media_url,
   product:products?.active&&!products.is_adult?products:null,
   category:categories?.active&&!categories.is_adult?categories:null
  };
 }));
}
export function feedRows(data:unknown):FeedRow[]{
 return (data??[]) as FeedRow[];
}
