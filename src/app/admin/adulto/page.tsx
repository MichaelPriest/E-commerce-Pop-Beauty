import Link from 'next/link';
import {ArrowLeft,Eye,ImageOff,LockKeyhole,PackagePlus,Settings,ShieldCheck,ShieldAlert,PackageOpen} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {formatBRL,productImageSrc} from '@/lib/products';

export const dynamic='force-dynamic';
type Variant={
 id:string; sku:string; shade:string|null;
 inventory:{on_hand:number;reserved:number}|null;
};
type AdultProduct={
 id:string;slug:string;name:string;brand:string;description:string;
 price_cents:number;cost_cents:number;image_url:string|null;active:boolean;
 categories:{name:string}|null;
 variants:Variant[];
};

export default async function AdultAdminPreview(){
 // Verificação na camada de servidor. Não usa claims editáveis pelo navegador.
 const supabase=await requireAdmin();
 const [settingsResult,productsResult]=await Promise.all([
  supabase.from('store_settings').select('adult_enabled').eq('id',1).maybeSingle(),
  supabase.from('products')
   .select('id,slug,name,brand,description,price_cents,cost_cents,image_url,active,categories(name),variants(id,sku,shade,inventory(on_hand,reserved))')
   .eq('is_adult',true).order('created_at',{ascending:false}).limit(100)
 ]);
 if(settingsResult.error||productsResult.error){
  return <div className="container admin-workspace">
   <h1>Prévia administrativa +18</h1>
   <p role="alert" className="form-error">Não foi possível consultar o catálogo: {settingsResult.error?.message||productsResult.error?.message}</p>
   <Link className="admin-outline" href="/admin">Voltar</Link>
  </div>;
 }
 const products=(productsResult.data??[]) as unknown as AdultProduct[];
 const active=products.filter(p=>p.active).length;
 const units=products.reduce((sum,p)=>sum+(p.variants??[]).reduce((count,v)=>count+(v.inventory?.on_hand??0),0),0);
 const enabled=!!settingsResult.data?.adult_enabled;
 return <div className="container admin-workspace admin-adult-preview">
  <div className="admin-top"><div>
   <div className="section-kicker">VISUALIZAÇÃO INTERNA • POPÊ BEAUTY</div>
   <h1><Eye size={29} inline/> Catálogo reservado +18</h1>
   <p>Prévia para administração de produtos, separada da loja pública.</p>
  </div>
   <Link href="/admin/produtos" className="admin-primary"><PackagePlus size={18}/> Gerenciar produtos</Link>
  </div>
  <div className="admin-adult-warning" role="note">
   <ShieldCheck size={25}/>
   <div><strong>Acesso administrativo liberado</strong>
    <p>Você pode visualizar os registros desta categoria porque sua conta é administradora. <b>Isso não comprova sua maioridade</b>, não aprova sua solicitação de verificação e não autoriza acesso ao checkout ou à seção como cliente.</p>
   </div>
  </div>
  <div className="admin-metric-row">
   <div><LockKeyhole/><small>Produtos da categoria +18</small><strong>{products.length}</strong></div>
   <div><PackageOpen/><small>Ativos no catálogo</small><strong>{active}</strong></div>
   <div><PackageOpen/><small>Unidades cadastradas</small><strong>{units}</strong></div>
   <div><Settings/><small>Módulo para clientes</small><strong className="admin-preview-flag">{enabled?'Ligado':'Desligado'}</strong></div>
  </div>
  <div className="admin-adult-controls">
   <Link href="/admin/configuracoes" className="admin-outline"><Settings size={17}/> Configurar módulo e verificação</Link>
   <Link href="/admin/estoque" className="admin-outline"><PackageOpen size={17}/> Estoque</Link>
   <Link href="/admin" className="admin-outline"><ArrowLeft size={17}/> Voltar ao painel</Link>
  </div>
  {products.length===0?
   <div className="admin-empty admin-adult-empty"><LockKeyhole size={40}/><h2>Catálogo ainda vazio</h2><p>Cadastre um produto e selecione a categoria Sex Shop +18 no módulo de produtos. Fotos ficam armazenadas em bucket privado.</p>
    <Link href="/admin/produtos" className="admin-primary"><PackagePlus size={18}/> Novo produto</Link></div>:
   <div className="admin-adult-grid">
    {products.map(p=>{
      const image=productImageSrc(p.image_url);
      const stock=(p.variants??[]).reduce((sum,v)=>sum+(v.inventory?.on_hand??0),0);
      const available=(p.variants??[]).reduce((sum,v)=>sum+Math.max(0,(v.inventory?.on_hand??0)-(v.inventory?.reserved??0)),0);
      return <article className="admin-adult-card" key={p.id}>
       <div className="admin-adult-image">{image?<img src={image} alt={p.name}/>:<ImageOff size={44}/>}
        <span className="admin-adult-lock"><LockKeyhole size={14}/> +18</span>
       </div>
       <div className="admin-adult-details">
        <div className="admin-adult-labels"><small>{p.brand}</small><span className={p.active?'admin-status live':'admin-status draft'}>{p.active?'Publicado':'Rascunho'}</span></div>
        <h2>{p.name}</h2><p>{p.description||'Sem descrição cadastrada.'}</p>
        <strong className="admin-adult-price">{formatBRL(p.price_cents)}</strong>
        <div className="admin-adult-info"><span>Custo: {formatBRL(p.cost_cents)}</span><span>Físico: {stock}</span><span>Disponível: {available}</span></div>
        <div className="admin-adult-skus">
        {(p.variants??[]).length? p.variants.map(v=><small key={v.id}>{v.sku}{v.shade?' • '+v.shade:''}</small>):<small>Sem variações cadastradas</small>}
        </div>
       </div>
      </article>;
    })}
   </div>}
  <div className="settings-tip"><ShieldAlert size={19}/>
   <span>Esta é uma tela interna de gestão. O acesso público à seção +18 continua restrito a clientes com verificação confiável de maioridade. A liberação comercial e os pagamentos não estão habilitados.</span>
  </div>
 </div>;
}
