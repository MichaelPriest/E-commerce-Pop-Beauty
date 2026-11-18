import {getFavoriteProducts} from '@/lib/catalog';
import {CATALOG_PAGE_SIZE} from '@/lib/catalog-query-core';
import {normalizeFavoriteIds} from '@/lib/favorite-ids';

export const dynamic='force-dynamic';
export async function GET(request:Request){
 const param=new URL(request.url).searchParams.get('ids')??'';
 const raw=param.split(',');
 const ids=normalizeFavoriteIds(raw);
 if(param.length>CATALOG_PAGE_SIZE*37||raw.length>CATALOG_PAGE_SIZE||ids.length!==raw.length){
  return Response.json({error:'Lista de produtos inválida.'},{status:400});
 }
 try{
  return Response.json(await getFavoriteProducts(ids),{headers:{'Cache-Control':'private, no-store'}});
 }catch{
  return Response.json({error:'Não foi possível carregar os produtos agora.'},{status:503});
 }
}
