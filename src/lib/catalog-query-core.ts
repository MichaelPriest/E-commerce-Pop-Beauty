/** Normalização segura para buscas de catálogo e links de paginação. */
/** Ordenação limitada a colunas públicas e permitidas pela vitrine. */
export type CatalogSort='recentes'|'menor-preco'|'maior-preco'|'nome';
export function normalizeCatalogSort(raw:unknown):CatalogSort{
 return raw==='menor-preco'||raw==='maior-preco'||raw==='nome'?raw:'recentes';
}

export const CATALOG_PAGE_SIZE=12;
export function normalizeCatalogSearch(raw:unknown){
 if(typeof raw!=='string')return '';
 return raw.normalize('NFC').replace(/[^\p{L}\p{N}\s-]/gu,' ')
  .replace(/\s+/g,' ').trim().slice(0,60);
}
export function normalizeCatalogCategory(raw:unknown){
 if(typeof raw!=='string')return '';
 return raw.normalize('NFC').replace(/[^\p{L}\p{N}\s-]/gu,' ')
  .replace(/\s+/g,' ').trim().slice(0,60);
}
export function normalizeCatalogPage(raw:unknown){
 if(typeof raw!=='string'||!/^\d{1,5}$/.test(raw))return 1;
 const value=Number(raw);
 return value>=1&&value<=10000?value:1;
}
export function catalogPageHref(input:{q:string;category:string;page:number;sort?:CatalogSort}){
 const p=new URLSearchParams();
 if(input.q)p.set('q',input.q);
 if(input.category)p.set('categoria',input.category);
 if(input.sort&&input.sort!=='recentes')p.set('ordem',input.sort);
 if(input.page>1)p.set('pagina',String(input.page));
 return '/'+(p.size?'?'+p.toString():'')+'#destaques';
}
