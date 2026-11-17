/** CSV para catálogo — validação local, sem gravar preços ou estoque.
 * Aceita separador ; (Excel pt-BR) ou , (CSV), aspas e BOM UTF-8.
 */
export type CatalogCsvRow={
 action:'create'|'update';sku:string;slug:string;name:string;
 category_slug:string;brand:string;description:string;
 price_cents:number;cost_cents:number;ean:string;
 variant_name:string;shade:string
};
export type CatalogCsvPreview={
 rows:CatalogCsvRow[];errors:string[];separator:';'|',';
};
export const CATALOG_CSV_COLUMNS=[
 'acao','sku','slug','nome','categoria_slug','marca','descricao',
 'preco','custo','ean','variacao','cor'
] as const;
export const CATALOG_CSV_TEMPLATE=
 '\ufeff'+CATALOG_CSV_COLUMNS.join(';')+'\r\n'+
 'criar;;batom-rosa;Batom Rosa;make;Popê Beauty;Batom cremoso;19,90;8,00;;Rosa;Rosa\r\n';

function csvCells(text:string,sep:string):string[][]{
 const rows:string[][]=[];
 let row:string[]=[],value='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){
   if(quoted&&text[i+1]==='"'){value+='"';i++;}
   else if(quoted){quoted=false;}
   else if(value===''){quoted=true;}
   else throw new Error('Aspas fora do início de um campo CSV.');
  }else if(c===sep&&!quoted){row.push(value);value='';}
  else if((c==='\r'||c==='\n')&&!quoted){
   if(c==='\r'&&text[i+1]==='\n')i++;
   row.push(value);
   if(row.some(x=>x.trim()))rows.push(row);
   row=[];value='';
  }else{value+=c;}
 }
 if(quoted)throw new Error('Aspas não fechadas no arquivo CSV.');
 row.push(value);
 if(row.some(x=>x.trim()))rows.push(row);
 return rows;
}
function getSeparator(line:string):';'|','{
 const counts={';':0,',':0};
 let quote=false;
 for(let i=0;i<line.length;i++){
  if(line[i]==='"'){if(line[i+1]==='"'){i++;}else quote=!quote;}
  if(!quote&&(line[i]===';'||line[i]===','))counts[line[i] as ';'|',']++;
 }
 return counts[';']>=counts[',']?';':',';
}
export function parseMoneyBR(value:string):number{
 const normalized=value.trim().replace(/^R\$\s*/i,'').replace(/\s/g,'');
 if(!/^(?:[0-9]{1,9}|[0-9]{1,3}(?:\.[0-9]{3})+)(?:,[0-9]{1,2})?$/.test(normalized)&&
  !/^[0-9]{1,9}(?:\.[0-9]{1,2})?$/.test(normalized)){
  throw new Error('Preço inválido: use 19,90 ou 129,00.');
 }
 const valueNumber=Number(normalized.replace(/\.(?=[0-9]{3}(?:\.|,|$))/g,'')
  .replace(',','.'));
 const cents=Math.round(valueNumber*100);
 if(!Number.isSafeInteger(cents)||cents<0||cents>100000000)
  throw new Error('Preço fora do limite (máximo R$ 1.000.000,00).');
 return cents;
}
export function isValidGtin(code:string){
 if(![8,12,13,14].includes(code.length)||!/^[0-9]+$/.test(code))return false;
 let sum=0;
 for(let i=0;i<code.length-1;i++){
  sum+=Number(code[i])*((code.length-i-1)%2===1?3:1);
 }
 return (10-sum%10)%10===Number(code.at(-1));
}
export function parseCatalogCsv(input:string):CatalogCsvPreview{
 const text=input.replace(/^\ufeff/,'');
 if(text.length>256000)throw new Error('Arquivo acima de 256 KB.');
 const firstLine=text.split(/\r?\n/,1)[0]??'';
 const separator=getSeparator(firstLine);
 const table=csvCells(text,separator);
 if(!table.length)throw new Error('Arquivo vazio.');
 const header=table[0].map(x=>x.trim().toLowerCase());
 if(header.join('|')!==CATALOG_CSV_COLUMNS.join('|')){
  throw new Error('Colunas incompatíveis. Baixe o modelo CSV para conferir a ordem.');
 }
 if(table.length<2||table.length>41)
  throw new Error('Use entre 1 e 40 produtos por arquivo.');
 const rows:CatalogCsvRow[]=[],errors:string[]=[];
 const skus=new Set<string>(),slugs=new Set<string>(),eanCodes=new Set<string>();
 for(let i=1;i<table.length;i++){
  const cells=table[i];const rowNumber=i+1;
  if(cells.length!==CATALOG_CSV_COLUMNS.length){
   errors.push('Linha '+rowNumber+': número de colunas incorreto.');
   continue;
  }
  const [acao,sku,slug,nome,categoria,marca,descricao,preco,custo,ean,variacao,cor]=
   cells.map(c=>c.trim());
  const action=acao.toLowerCase()==='criar'?'create':
   acao.toLowerCase()==='atualizar'?'update':null;
  if(!action){errors.push('Linha '+rowNumber+': use criar ou atualizar.');continue;}
  if(nome.length<2||nome.length>150){
   errors.push('Linha '+rowNumber+': nome deve ter 2–150 caracteres.');continue;
  }
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(categoria)){
   errors.push('Linha '+rowNumber+': categoria_slug inválida.');continue;
  }
  if(action==='create'&&(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>160)){
   errors.push('Linha '+rowNumber+': slug obrigatório para novos produtos.');continue;
  }
  if(action==='update'&&(!sku||sku.length>80)){
   errors.push('Linha '+rowNumber+': SKU obrigatório para atualizar.');continue;
  }
  if(sku&&(!/^.{2,80}$/.test(sku)||(action==='create'&&/^POP-[0-9]{7,}$/.test(sku)))){
   errors.push('Linha '+rowNumber+': SKU inválido ou prefixo reservado.');continue;
  }
  if(sku&&skus.has(sku)){
   errors.push('Linha '+rowNumber+': SKU repetido no CSV.');continue;
  }
  if(action==='create'&&slugs.has(slug)){
   errors.push('Linha '+rowNumber+': slug repetido no CSV.');continue;
  }
  if(ean&&(!isValidGtin(ean)||eanCodes.has(ean))){
   errors.push('Linha '+rowNumber+': código de barras inválido ou repetido.');continue;
  }
  let price_cents:number,cost_cents:number;
  try{price_cents=parseMoneyBR(preco);cost_cents=parseMoneyBR(custo);}
  catch(e){errors.push('Linha '+rowNumber+': '+(e instanceof Error?e.message:'preço inválido'));continue;}
  if(marca.length>120||descricao.length>5000||variacao.length>100||cor.length>100){
   errors.push('Linha '+rowNumber+': marca, descrição ou variação muito longa.');continue;
  }
  if(sku)skus.add(sku);
  if(action==='create')slugs.add(slug);
  if(ean)eanCodes.add(ean);
  rows.push({action,sku,slug:action==='create'?slug:'',
   name:nome,category_slug:categoria,
   brand:marca||'Popê Beauty',description:descricao,
   price_cents,cost_cents,ean,variant_name:variacao||'Padrão',shade:cor});
 }
 return {rows,errors,separator};
}
