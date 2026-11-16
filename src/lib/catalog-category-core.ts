/** Regras compartilhadas de exibição/organização de categorias do catálogo. */
export type CatalogCategory={
 id:string;slug:string;name:string;parent_id:string|null;
 position:number;active:boolean;is_adult:boolean
};
export function slugifyCategory(name:string){
 return name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100);
}
export function suggestedCategorySlug(name:string,parent:CatalogCategory|null){
 const slug=slugifyCategory(name);
 return parent?parent.slug+'-'+slug:slug;
}
export function sortedCategoryTree(categories:CatalogCategory[]){
 const sorted=[...categories].sort((a,b)=>a.position-b.position||
  a.name.localeCompare(b.name,'pt-BR'));
 return sorted.filter(x=>!x.parent_id).map(root=>({
  ...root,children:sorted.filter(sub=>sub.parent_id===root.id)
 }));
}
export function matchingCategoryIds(
 categories:CatalogCategory[],selected:string
):string[]{
 const wanted=selected.trim().toLocaleLowerCase('pt-BR');
 const category=categories.find(x=>x.active&&!x.is_adult&&
  (x.slug===wanted||x.name.toLocaleLowerCase('pt-BR')===wanted));
 if(!category)return [];
 if(category.parent_id)return [category.id];
 return [category.id,...categories.filter(x=>x.parent_id===category.id&&
  x.active&&!x.is_adult).map(x=>x.id)];
}
