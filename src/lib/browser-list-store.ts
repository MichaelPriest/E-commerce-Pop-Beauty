// Carrinho e favoritos usam as chaves já existentes neste navegador.
export function createBrowserList<T>(key:string, normalize:(raw:unknown)=>T[]){
 const eventName=key+'-updated';
 let previous:string|null=null;
 let snapshot:T[]=[];
 let temporary:string|null=null;

 function readRaw(){
  if(typeof window==='undefined')return null;
  if(temporary!==null)return temporary;
  try{return window.localStorage.getItem(key);}catch{return null;}
 }
 function getSnapshot(){
  const raw=readRaw();
  if(raw!==previous){
   try{snapshot=normalize(JSON.parse(raw??'[]'));}
   catch{snapshot=[];}
   previous=raw;
  }
  return snapshot;
 }
 function write(items:T[]){
  const raw=JSON.stringify(normalize(items));
  try{
   window.localStorage.setItem(key,raw);
   temporary=null;
  }catch{temporary=raw;}
  window.dispatchEvent(new Event(eventName));
 }
 function subscribe(notify:()=>void){
  function changed(event:StorageEvent){
   if(event.key!==key&&event.key!==null)return;
   temporary=null;
   notify();
  }
  window.addEventListener(eventName,notify);
  window.addEventListener('storage',changed);
  return ()=>{
   window.removeEventListener(eventName,notify);
   window.removeEventListener('storage',changed);
  };
 }
 return {getSnapshot,readRaw,write,subscribe};
}
