import {createClient} from '@/lib/supabase/browser';

const fields = 'id,sku,ean,name,shade,active,products!inner(id,name,active)';
export type StockVariant = {
 id: string;
 sku: string;
 ean: string | null;
 name: string;
 shade: string | null;
 active: boolean;
 products: {id: string; name: string; active: boolean} | null;
};

export async function findStockVariant(code: string): Promise<StockVariant | null> {
 const value = code.trim();
 if (!value || value.length > 80) return null;
 const sb = createClient();
 const variants = () => sb.from('variants').select(fields)
  .eq('active',true).eq('products.active',true);
 if (/^[0-9]{8,14}$/.test(value)) {
  const {data,error} = await variants().eq('ean',value).maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data as unknown as StockVariant;
 }
 const {data,error} = await variants()
  .in('sku',Array.from(new Set([value,value.toUpperCase()])));
 if (error) throw new Error(error.message);
 const variant = data?.find(row => row.sku === value) ?? data?.[0];
 return (variant as unknown as StockVariant | undefined) ?? null;
}

export async function findInvoiceVariants(eans: string[], skus: string[]): Promise<StockVariant[]> {
 const sb = createClient();
 const queries = [];
 for (const [field,codes] of [['ean',eans],['sku',skus]] as const) {
  const unique = Array.from(new Set(codes.filter(value => value && value.length <= 80)));
  for (let offset = 0; offset < unique.length; offset += 25) {
   queries.push(sb.from('variants').select(fields).eq('active',true).eq('products.active',true)
    .in(field,unique.slice(offset,offset + 25)));
  }
 }
 const responses = await Promise.all(queries);
 const error = responses.find(response => response.error)?.error;
 if (error) throw new Error(error.message);
 return responses.flatMap(response => response.data ?? []) as unknown as StockVariant[];
}
