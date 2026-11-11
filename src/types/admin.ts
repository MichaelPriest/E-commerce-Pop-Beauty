export type Category = {id:string;name:string;is_adult:boolean};
export type InventoryRow = {on_hand:number;reserved:number;safety_stock:number} | null;
export type LotRow = {id:string;lot_code:string;expires_at:string|null;on_hand:number};
export type VariantRow = {
 id:string;product_id?:string;name:string;sku:string;shade:string|null;ean:string|null;active:boolean;
 inventory:InventoryRow; inventory_lots:LotRow[];
};
export type AdminProduct = {
 id:string;slug:string;name:string;brand:string;description:string;category_id:string|null;
 price_cents:number;cost_cents:number;compare_at_cents:number|null;image_url:string|null;
 active:boolean;is_adult:boolean;created_at:string;categories:Category|null;variants:VariantRow[];
};
export type StockVariant = Omit<VariantRow,'product_id'> & {
 products: {id:string;name:string;brand:string;active:boolean;price_cents:number;cost_cents:number}|null;
};

export type StockMovement={
 id:string;delta:number;reason:string;created_at:string;
 variants:{sku:string;products:{name:string}|null}|null;
 inventory_lots:{lot_code:string}|null;
};
