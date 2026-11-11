export type CustomerAddress={
 id:string;recipient:string;phone:string;postal_code:string;
 street:string;house_number:string;complement:string;district:string;
 city:string;state_code:string;is_default:boolean;created_at:string;
};
export const BRAZIL_STATES=[
 'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
 'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
] as const;
export const formatZip=(zip:string)=>zip.length===8?zip.slice(0,5)+'-'+zip.slice(5):zip;
