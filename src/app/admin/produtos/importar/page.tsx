import Link from 'next/link';
import {ArrowLeft,FileSpreadsheet} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {CatalogImportManager} from './catalog-import-manager';

export const dynamic='force-dynamic';
export const metadata={title:'Importação CSV de produtos | Popê Beauty'};

export default async function CatalogImportPage(){
 const sb=await requireAdmin();
 const {data:categories,error}=await sb.from('categories')
  .select('id,slug,name,active,is_adult').eq('active',true)
  .eq('is_adult',false).order('name',{ascending:true}).limit(300);
 if(error)throw new Error('Não foi possível carregar as categorias para importação.');
 return <div className="container admin-workspace pope-csv-admin">
  <div className="admin-top">
   <div>
    <div className="section-kicker">POPÊ BEAUTY • OPERAÇÃO DE CATÁLOGO</div>
    <h1><FileSpreadsheet size={27}/> Importar produtos por CSV</h1>
    <p>Crie rascunhos e atualize dados de produtos existentes com conferência obrigatória.</p>
   </div>
   <Link href="/admin/produtos" className="admin-outline">
    <ArrowLeft size={16}/> Voltar aos produtos
   </Link>
  </div>
  <CatalogImportManager categories={categories??[]}/>
 </div>;
}
