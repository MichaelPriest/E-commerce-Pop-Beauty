import Link from 'next/link';
import type {ReactNode} from 'react';
import { LayoutDashboard, PackageSearch, Boxes, ArrowLeft, Truck, Settings, Eye } from 'lucide-react';
import { requireAdmin } from '@/lib/admin';
export const dynamic='force-dynamic';
export default async function AdminLayout({children}:{children:ReactNode}) {
 await requireAdmin();
 return <><div className="admin-master-nav"><div className="container admin-master-row">
 <div className="admin-master-title">💖 Popê <strong>Gestão</strong></div>
 <nav aria-label="Administração Popê" className="admin-master-links">
 <Link href="/admin"><LayoutDashboard size={18}/> Visão geral</Link>
 <Link href="/admin/produtos"><PackageSearch size={18}/> Produtos</Link>
 <Link href="/admin/estoque"><Boxes size={18}/> Estoque</Link>
 <Link href="/admin/adulto"><Eye size={18}/> Prévia +18</Link>
 <Link href="/admin/configuracoes"><Settings size={18}/> Configurações</Link>
 <span className="admin-soon"><Truck size={18}/> Logística em breve</span>
 </nav>
 <Link href="/" className="admin-back"><ArrowLeft size={15}/> Loja</Link></div></div>{children}</>;
}
