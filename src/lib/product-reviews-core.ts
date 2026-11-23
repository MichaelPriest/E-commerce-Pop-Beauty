export type ProductReview={
 id:string;product_id:string;user_id:string;author_name:string;
 rating:number;comment:string;status:'pending'|'published'|'hidden';
 created_at:string;updated_at:string;
};
export type ReviewSummary={average_rating:number;rating_count:number};
export function validateProductReview(rating:unknown,comment:unknown):string|null{
 if(typeof rating!=='number'||!Number.isInteger(rating)||rating<1||rating>5)
  return 'Escolha de 1 a 5 estrelas.';
 if(typeof comment!=='string'||comment.trim().length<10||
  comment.trim().length>1200)return 'Escreva entre 10 e 1.200 caracteres.';
 return null;
}
export function starsOf(rating:number):string{
 const count=Math.max(0,Math.min(5,Math.round(rating)));
 return '★'.repeat(count)+'☆'.repeat(5-count);
}
