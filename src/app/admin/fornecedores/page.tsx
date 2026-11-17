import Link from 'next/link';
import {ArrowLeft,Building2} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {SupplierManager} from './supplier-manager';
export const dynamic='force-dynamic';
export const metadata={title:'Fornecedores | Popê Beauty'};
export default async function SuppliersPage(){
 const sb=await requireAdmin();
 const {data,error}=await sb.from('suppliers')
  .select('id,name,tax_id,email,phone,notes,active,created_at')
  .order('name').limit(400);
 if(error)return <div className="container admin-workspace"><h1>Fornecedores</h1>
  <p className="form-error" role="alert">{error.message}</p></div>;
 return <div className="container admin-workspace pope-suppliers-admin">
  <div className="admin-top">
   <div><div className="section-kicker">POPÊ BEAUTY • SUPRIMENTOS</div>
    <h1><Building2 size={27}/> Cadastro de fornecedores</h1>
    <p>Centralize contatos e vincule fornecedores ao recebimento de mercadorias.</p>
   </div>
   <Link href="/admin/estoque/recebimento" className="admin-outline">
    <ArrowLeft size={16}/> Recebimentos</Link>
  </div>
  <SupplierManager suppliers={data??[]}/>
 </div>;
}
