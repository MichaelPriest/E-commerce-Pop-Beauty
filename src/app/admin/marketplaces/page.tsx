import {requireAdmin} from '@/lib/admin';
import {MarketplacesManager} from './marketplaces-manager';
import type {ListingRow,SellableSku} from '@/types/operations';
import type {MarketplaceAccountRow,MarketplaceImportRow} from './marketplace-connections';
import {marketplaceVaultConfigured} from '@/lib/marketplaces/vault';
import {providerConfigured} from '@/lib/marketplaces/provider-auth';
export const dynamic='force-dynamic';
export default async function MarketplacesPage(){
 const sb=await requireAdmin();
 const [links,variants,accounts,imports]=await Promise.all([
  sb.from('marketplace_listings')
   .select('id,channel,external_listing_id,sync_status,last_synced_at,variants(id,sku,products(name,is_adult))')
   .order('channel',{ascending:true}).limit(500),
  sb.from('variants')
   .select('id,sku,name,shade,products(name,price_cents,active,is_adult),inventory(on_hand,reserved)')
   .eq('active',true).order('sku').limit(700),
  sb.from('marketplace_connections')
   .select('id,channel,external_account_id,display_name,status,token_expires_at,last_synced_at,last_error')
   .order('updated_at',{ascending:false}).limit(100),
  sb.from('marketplace_readonly_imports')
   .select('id,connection_id,kind,external_id,title,sku,external_status,amount_cents,quantity,updated_at')
   .order('updated_at',{ascending:false}).limit(120)
 ]);
 if(links.error||variants.error||accounts.error||imports.error)return <div className="container admin-workspace"><h1>Marketplaces</h1><p role="alert" className="form-error">{links.error?.message||variants.error?.message||accounts.error?.message||imports.error?.message}</p></div>;
 return <MarketplacesManager
  links={(links.data??[]) as unknown as ListingRow[]}
  variants={(variants.data??[]) as unknown as SellableSku[]}
  accounts={(accounts.data??[]) as MarketplaceAccountRow[]}
  imports={(imports.data??[]) as MarketplaceImportRow[]}
  vaultReady={marketplaceVaultConfigured()}
  configured={{
   shopee:providerConfigured('shopee'),mercadolivre:providerConfigured('mercadolivre')
  }}
 />;
}
