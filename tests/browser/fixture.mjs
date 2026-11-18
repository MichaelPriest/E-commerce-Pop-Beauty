import http from 'node:http';
const pid='22222222-2222-4222-8222-222222222222',p2='77777777-7777-4777-8777-777777777777';
const variant='33333333-3333-4333-8333-333333333333';
const userId='11111111-1111-4111-8111-111111111111',otherId='55555555-5555-4555-8555-555555555555';
const products=[
 {id:pid,slug:'batom-rosa',name:'Batom Rosa',brand:'Popê',description:'Cor rosa',price_cents:2990,image_url:null,categories:{name:'Make'}},
 {id:p2,slug:'serum',name:'Sérum Floral',brand:'Popê',description:'Sérum',price_cents:4590,image_url:null,categories:{name:'Skincare'}}
];
const users={
 [userId]:{id:userId,email:'ana@loja.example',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{full_name:'Ana Costa'}},
 [otherId]:{id:otherId,email:'bia@loja.example',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{full_name:'Bia Dias'}}
};
const names={[userId]:'Ana Costa',[otherId]:'Bia Dias'};
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const order=(i)=>({
 id:(90000000+i).toString()+'-9999-4999-8999-999999999999',status:i===0?'shipped':i===1?'pending':'delivered',
 origin:i===1?'store_api':'storefront',storefront_order:i!==1,total_cents:5990+i,
 created_at:new Date(Date.UTC(2026,9,23-i,14,30)).toISOString(),reservation_expires_at:i===1?'2027-01-23T10:00:00.000Z':null,
 checkout_delivery_fee_cents:800,checkout_delivery_snapshot:{name:'Entrega padrão'},tracking_code:i===0?'BR1234TEST':null,store_order_cancellations:[]
});
const orders=Array.from({length:22},(_,i)=>order(i));
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1:4391'),p=u.pathname,q=u.searchParams;
 res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers',req.headers['access-control-request-headers']??'authorization,apikey,content-type,x-client-info');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS');
 function send(data,status=200){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));}
 const rows=(list)=>send(req.headers.accept?.includes('vnd.pgrst.object')?list[0]??null:list);
 if(req.method==='OPTIONS')return send({},200);
 let body='';for await(const b of req)body+=b;
 const data=body?JSON.parse(body):{};
 let principal;
 try{principal=JSON.parse(Buffer.from(req.headers.authorization.split('.')[1],'base64url')).sub;}catch{}
 if(p==='/auth/v1/token'){
  const who=Object.values(users).find(x=>x.email===data.email);
  if(!who||data.password!=='fixture-password')return send({message:'Credenciais inválidas'},400);
  const now=Math.floor(Date.now()/1000),exp=now+7200;
  const jwt=encode({alg:'HS256',typ:'JWT'})+'.'+encode({...who,sub:who.id,exp,iat:now})+'.dGVzdG9ubHk';
  return send({access_token:jwt,refresh_token:'local-fixture-refresh',expires_at:exp,expires_in:7200,token_type:'bearer',user:who});
 }
 if(p==='/auth/v1/user')return users[principal]?send(users[principal]):send({message:'guest'},401);
 if(p==='/auth/v1/logout')return send({});
 if(p==='/rest/v1/profiles'){
  if(!users[principal]||q.get('id')!=='eq.'+principal)return send({message:'wrong owner'},403);
  if(req.method==='PATCH'){if(Object.keys(data).join(',')!=='display_name')return send({},400);names[principal]=data.display_name;}
  return rows([{id:principal,display_name:names[principal],role:'customer'}]);
 }
 if(p==='/rest/v1/orders'){
  if(!users[principal]||q.get('customer_id')!=='eq.'+principal)return send({message:'wrong owner'},403);
  return rows((principal===userId?orders:[]).slice(+(q.get('offset')??0),+(q.get('offset')??0)+ +(q.get('limit')??50)));
 }
 if(p==='/rest/v1/customer_addresses'){
  if(!users[principal]||q.get('user_id')!=='eq.'+principal||q.get('archived_at')!=='is.null')return send({message:'wrong owner'},403);
  return rows([]);
 }
 if(p==='/rest/v1/store_settings')return rows([{adult_enabled:false}]);
 if(p==='/rest/v1/categories')return rows([{id:'77777777-8888-4888-8888-777777777777',name:'Make',slug:'make',position:1,parent_id:null,active:true,is_adult:false}]);
 if(p==='/rest/v1/products'){
  if(q.get('is_adult')!=='eq.false'||q.get('active')!=='eq.true')return send({},400);
  const list=products.filter(x=>(!q.has('id')||q.get('id').includes(x.id))&&(!q.has('slug')||q.get('slug')==='eq.'+x.slug));
  res.setHeader('Content-Range','0-'+Math.max(list.length-1,0)+'/'+list.length);return rows(list);
 }
 if(p==='/rest/v1/product_gallery_images')return rows([]);
 if(p==='/rest/v1/rpc/catalog_product_availability')return send(data.p_product_ids.map(id=>({product_id:id,active_variant_count:1,can_add_to_cart:true,status:'ready'})));
 if(p==='/rest/v1/rpc/catalog_variant_availability')return send(data.p_product_ids.map(id=>({product_id:id,variant_id:id===pid?variant:'88888888-8888-4888-8888-888888888888',sku:'POP-1',name:'Rosa',shade:'Rosa',available:true})));
 if(p==='/rest/v1/rpc/touch_user_session_presence'||p==='/rest/v1/rpc/end_user_session_presence')return send(null);
 console.error('Unexpected fixture call',req.method,p);
 return send({},404);
});
server.listen(4391,'127.0.0.1',()=>console.log('Customer fixture ready'));
