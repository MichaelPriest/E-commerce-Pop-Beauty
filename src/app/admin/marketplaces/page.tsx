import {requireAdmin} from '@/lib/admin';
import {MarketplacesManager} from './marketplaces-manager';
import type {ListingRow,SellableSku} from '@/types/operations';
export const dynamic='force-dynamic';
export default async function MarketplacesPage(){
 const sb=await requireAdmin();
 const [links,variants]=await Promise.all([
  sb.from('marketplace_listings')
   .select('id,channel,external_listing_id,sync_status,last_synced_at,variants(id,sku,products(name,is_adult))')
   .order('channel',{ascending:true}).limit(500),
  sb.from('variants')
   .select('id,sku,name,shade,products(name,price_cents,active,is_adult),inventory(on_hand,reserved)')
   .eq('active',true).order('sku').limit(700)
 ]);
 if(links.error||variants.error)return <div className="container admin-workspace"><h1>Marketplaces</h1><p role="alert" className="form-error">{links.error?.message||variants.error?.message}</p></div>;
 return <MarketplacesManager links={(links.data??[]) as unknown as ListingRow[]}
   variants={(variants.data??[]) as unknown as SellableSku[]}/>;
}
