export type Product = {
  id: string; slug: string; name: string; description: string; brand: string;
  price_cents: number; compare_at_cents: number | null; image_url: string | null;
  category: string; emoji?: string; tone?: string;
};
export const demoProducts: Product[] = [
  {id:'demo-1',slug:'batom-cremoso-rosa',name:'Batom Cremoso Rosa Pop',description:'Cor vibrante e acabamento confortável para arrasar.',brand:'Popê Beauty',price_cents:2990,compare_at_cents:3990,image_url:null,category:'Make',emoji:'💄',tone:'pink'},
  {id:'demo-2',slug:'kit-pinceis-beauty',name:'Kit de Pincéis Beauty',description:'Cinco pincéis versáteis para sua rotina de beleza.',brand:'Popê Beauty',price_cents:5990,compare_at_cents:null,image_url:null,category:'Acessórios',emoji:'🖌️',tone:'purple'},
  {id:'demo-3',slug:'serum-facial',name:'Sérum Facial Hidratante',description:'Textura leve e hidratação para o cuidado diário.',brand:'Popê Beauty',price_cents:4990,compare_at_cents:null,image_url:null,category:'Skincare',emoji:'🧴',tone:'aqua'},
  {id:'demo-4',slug:'creme-hidratante',name:'Creme Facial Hidratante',description:'Uma pausa de autocuidado com toque delicado.',brand:'Popê Beauty',price_cents:3990,compare_at_cents:4990,image_url:null,category:'Skincare',emoji:'🫙',tone:'pink'},
  {id:'demo-5',slug:'kit-presente',name:'Kit Completo de Beleza',description:'Uma seleção especial para presentear.',brand:'Popê Beauty',price_cents:13990,compare_at_cents:null,image_url:null,category:'Kits',emoji:'🎁',tone:'yellow'},
  {id:'demo-6',slug:'esponja-make',name:'Esponja de Maquiagem',description:'Aplicação prática para um acabamento uniforme.',brand:'Popê Beauty',price_cents:1390,compare_at_cents:1990,image_url:null,category:'Acessórios',emoji:'🩷',tone:'purple'}
];
export const formatBRL = (cents: number) => (cents / 100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

