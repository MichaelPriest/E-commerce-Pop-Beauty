/** Vitrine: usa somente dados públicos autorizados para exibir amostras de SKU.
 * Nenhuma quantidade de estoque ou lote é exposta.
 */
export type CatalogCardVariant={
 variant_id:string;sku:string;name:string;shade:string|null;
 available:boolean;image_url:string|null
};
export type CatalogCardGalleryImage={
 product_id:string;variant_id:string|null;storage_path:string
};
export function cardVariantCover(
 variantId:string|null,cover:string|null,generalImage:string|null,
 gallery:readonly {variant_id:string|null;url:string}[]
):string|null{
 if(variantId){
  const image=gallery.find(x=>x.variant_id===variantId)?.url;
  if(image)return image;
 }
 return cover||generalImage||null;
}
export function selectedCardVariant(
 variants:readonly CatalogCardVariant[],selectedId:string
):CatalogCardVariant|null{
 return variants.find(x=>x.variant_id===selectedId)??null;
}
export function cardVariantLabel(variant:Pick<CatalogCardVariant,'shade'|'name'|'sku'>){
 return variant.shade?.trim()||variant.name.trim()||variant.sku;
}
