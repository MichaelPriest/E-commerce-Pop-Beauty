/** Funções puras para a navegação do painel Popê Beauty. */
export type AdminNavigationTarget={href:string;label:string};
export type AdminNavigationSection={
 id:string;items:readonly AdminNavigationTarget[];
};
/** Prefixo com limite de segmento: /admin/estoque não corresponde a /admin/estoqueiro. */
export function adminRouteMatches(pathname:string,href:string):boolean{
 if(!pathname.startsWith('/admin')||!href.startsWith('/admin'))return false;
 return pathname===href||(href!=='/admin'&&pathname.startsWith(href+'/'));
}
/** A rota mais específica tem prioridade sobre o pai (produtos/importar > produtos). */
export function activeAdminRoute(pathname:string,items:readonly AdminNavigationTarget[]):string{
 let selected='';
 for(const item of items){
  if(adminRouteMatches(pathname,item.href)&&item.href.length>selected.length)
   selected=item.href;
 }
 return selected;
}
export function activeAdminSection(pathname:string,sections:readonly AdminNavigationSection[]):string{
 const target=activeAdminRoute(pathname,sections.flatMap(section=>section.items));
 return sections.find(section=>section.items.some(item=>item.href===target))?.id??'';
}
export function normalizeAdminNavigationText(raw:string):string{
 return raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR')
  .replace(/\s+/g,' ').trim();
}
export function searchAdminNavigation<T extends AdminNavigationTarget>(
 targets:readonly T[],query:string,limit=20
):T[]{
 const normalized=normalizeAdminNavigationText(query);
 if(!normalized)return targets.slice(0,limit);
 const terms=normalized.split(' ');
 return targets.filter(target=>{
  const text=normalizeAdminNavigationText(target.label);
  return terms.every(term=>text.includes(term));
 }).slice(0,limit);
}
