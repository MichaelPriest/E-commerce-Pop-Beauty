/** Escolha de fotos por SKU. A capa e as fotos gerais são fallback,
 * enquanto a foto específica da variação escolhida aparece primeiro.
 * Sem SKU escolhido, fotos de outras variações ficam ocultas.
 */
export type VariantGalleryPhoto={
 id:string;url:string;alt:string;variant_id:string|null;
};
export type DisplayGalleryPhoto={
 id:string;url:string;alt:string;source:'variant'|'general'|'cover'
};
export function visibleProductGallery(
 cover:string|null,productName:string,
 photos:readonly VariantGalleryPhoto[],variantId:string|null
):DisplayGalleryPhoto[]{
 const unique=new Set<string>();
 const ordered:DisplayGalleryPhoto[]=[];
 const add=(photo:DisplayGalleryPhoto)=>{
  if(!photo.url||unique.has(photo.url))return;
  unique.add(photo.url);
  ordered.push(photo);
 };
 if(variantId)for(const photo of photos){
  if(photo.variant_id===variantId)
   add({...photo,source:'variant'});
 }
 if(cover)add({id:'cover',url:cover,alt:'Foto principal de '+productName,source:'cover'});
 for(const photo of photos){
  if(photo.variant_id===null)add({...photo,source:'general'});
 }
 return ordered;
}
