import Link from 'next/link';
import {Truck,PackageCheck,ShieldCheck,ArrowLeft,MapPin,Box} from 'lucide-react';
import {requireAdmin} from '@/lib/admin';
import {ShippingManager} from './shipping-manager';

export const dynamic='force-dynamic';
export type ShippingVariant={
 id:string;product_id:string;sku:string;name:string;active:boolean;
 product_name:string;product_active:boolean;product_adult:boolean;
 weight_g:number|null;height_cm:number|null;width_cm:number|null;length_cm:number|null;
};
export default async function ShippingAdminPage(){
 const sb=await requireAdmin();
 const [settings,variants]=await Promise.all([
  sb.from('shipping_origin_settings').select('origin_postal_code').eq('id',1).maybeSingle(),
  sb.from('variants').select(
   'id,product_id,sku,name,active,products(name,active,is_adult),variant_shipping_specs(weight_g,height_cm,width_cm,length_cm)'
  ).order('sku').limit(250)
 ]);
 if(settings.error||variants.error)return <div className="container admin-workspace">
  <h1>Frete e embalagem</h1>
  <p role="alert" className="form-error">{settings.error?.message||variants.error?.message}</p>
 </div>;
 const rows=(variants.data??[]).map(v=>{
  const product=Array.isArray(v.products)?v.products[0]:v.products;
  const shipping=Array.isArray(v.variant_shipping_specs)?v.variant_shipping_specs[0]:v.variant_shipping_specs;
  return {
   id:v.id,product_id:v.product_id,sku:v.sku,name:v.name,active:v.active,
   product_name:product?.name??'Produto',product_active:product?.active??false,
   product_adult:product?.is_adult??false,
   weight_g:shipping?.weight_g??null,height_cm:shipping?.height_cm??null,
   width_cm:shipping?.width_cm??null,length_cm:shipping?.length_cm??null
  };
 }) as ShippingVariant[];
 return <div className="container admin-workspace">
  <div className="admin-top"><div>
   <div className="section-kicker">LOGÍSTICA • HOMOLOGAÇÃO</div>
   <h1><Truck size={30}/> Frete e embalagem</h1>
   <p>Configure origem e dimensões físicas para cotar entregas em um ambiente de testes.</p>
  </div><Link href="/admin/logistica" className="admin-outline"><ArrowLeft size={16}/> Logística</Link></div>
  <div className="admin-metric-row">
   <div><Box/><small>SKUs cadastrados</small><strong>{rows.length}</strong></div>
   <div><PackageCheck/><small>SKUs com dimensões</small><strong>{rows.filter(v=>v.weight_g).length}</strong></div>
   <div><MapPin/><small>CEP de origem</small><strong>{settings.data?.origin_postal_code?'Configurado':'Pendente'}</strong></div>
   <div><ShieldCheck/><small>Etiquetas reais geradas</small><strong>0</strong></div>
  </div>
  <p className="ops-info"><ShieldCheck size={18}/> Cotações serão feitas exclusivamente no sandbox do Melhor Envio, quando houver token configurado. Não são criadas etiquetas, não é realizada compra de frete e os valores apresentados não podem ser usados para cobrar clientes. O envio público e o checkout seguem bloqueados.</p>
  <ShippingManager
   rows={rows}
   initialOriginZip={settings.data?.origin_postal_code??''}
   sandboxTokenPresent={Boolean(process.env.MELHOR_ENVIO_SANDBOX_TOKEN?.trim())}
  />
 </div>;
}
