import {NextResponse,type NextRequest} from 'next/server';
import {getAdultStatus} from '@/lib/adult';
import {createClient} from '@/lib/supabase/server';
export const dynamic='force-dynamic';
export async function GET(_request:NextRequest,{params}:{params:Promise<{filename:string}>}){
 const {filename}=await params;
 if(!/^[a-f0-9-]{36}\.(?:jpg|png|webp)$/.test(filename))return new NextResponse(null,{status:404});
 const sb=await createClient();
 const {data:auth}=await sb.auth.getClaims();
 if(!auth?.claims?.sub)return new NextResponse(null,{status:404});
 const [{data:profile},status]=await Promise.all([
  sb.from('profiles').select('role').eq('id',auth.claims.sub).maybeSingle(),
  getAdultStatus(),
 ]);
 const admin=profile?.role==='admin';
 if(!admin&&!(status.enabled&&status.verified))return new NextResponse(null,{status:404});
 if(!admin){
  const {data:product}=await sb.from('products').select('id')
    .eq('image_url','adult-products:products/'+filename).eq('active',true).eq('is_adult',true).maybeSingle();
  if(!product)return new NextResponse(null,{status:404});
 }
 const {data,error}=await sb.storage.from('adult-products').download('products/'+filename);
 if(error||!data)return new NextResponse(null,{status:404});
 const mime=filename.endsWith('.png')?'image/png':filename.endsWith('.webp')?'image/webp':'image/jpeg';
 return new NextResponse(data,{headers:{'Content-Type':mime,'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}});
}
