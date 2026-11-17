/** CPF/CNPJ de fornecedores: dígitos verificadores (apenas valida formato,
 * não consulta cadastro fiscal, Receita Federal ou situação cadastral).
 */
export function supplierTaxIdValid(value:string):boolean{
 const digits=value.replace(/\D/g,'');
 if(![11,14].includes(digits.length)||/^(\d)\1+$/.test(digits))return false;
 const numbers=Array.from(digits,Number);
 const check=(length:number,weights:number[])=>{
  const sum=weights.reduce((total,w,i)=>total+numbers[i]*w,0);
  const digit=sum%11<2?0:11-sum%11;
  return numbers[length]===digit;
 };
 if(numbers.length===11){
  return check(9,[10,9,8,7,6,5,4,3,2])&&
   check(10,[11,10,9,8,7,6,5,4,3,2]);
 }
 return check(12,[5,4,3,2,9,8,7,6,5,4,3,2])&&
  check(13,[6,5,4,3,2,9,8,7,6,5,4,3,2]);
}
