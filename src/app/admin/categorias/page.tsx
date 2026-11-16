import Link from 'next/link';
import {requireAdmin} from '@/lib/admin';
import {CategoryManager} from './category-manager';
import type {CatalogCategory} from '@/lib/catalog-category-core';

export const dynamic='force-dynamic';
export const metadata={title:'Categorias e subcategorias | Popê Beauty'};
export default async function AdminCategoriesPage(){
 const sb=await requireAdmin();
 const {data,error,count}=await sb.from('categories')
  .select('id,slug,name,parent_id,position,active,is_adult',{count:'exact'})
  .order('position',{ascending:true}).order('name',{ascending:true}).limit(500);
 if(error)return <div className="container admin-workspace">
  <h1>Categorias e subcategorias</h1>
  <p role="alert" className="form-error">Não foi possível carregar as categorias:
   {' '}{error.message}</p><Link href="/admin/produtos">Voltar a produtos</Link>
 </div>;
 return <CategoryManager
  categories={(data??[]) as CatalogCategory[]}
  truncated={(count??0)>500}/>;
}
