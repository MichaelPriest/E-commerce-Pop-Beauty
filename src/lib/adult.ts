import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export type AdultStatus = {
 enabled:boolean;
 verified:boolean;
 userId:string|null;
 requestStatus:'pending'|'approved'|'rejected'|null;
};

export async function getAdultStatus():Promise<AdultStatus>{
 const denied:AdultStatus={enabled:false,verified:false,userId:null,requestStatus:null};
 if(!isSupabaseConfigured())return denied;
 const sb=await createClient();
 const {data:settings,error:settingsError}=await sb.from('store_settings')
  .select('adult_enabled').eq('id',1).maybeSingle();
 if(settingsError||!settings?.adult_enabled)return denied;
 const {data:auth}=await sb.auth.getClaims();
 const userId=auth?.claims?.sub;
 if(!userId)return {...denied,enabled:true};
 const [verification,request]=await Promise.all([
  sb.from('age_verifications').select('verified_at,expires_at').eq('user_id',userId).maybeSingle(),
  sb.from('age_verification_requests').select('status').eq('user_id',userId).maybeSingle()
 ]);
 const now=Date.now();
 const verified=!!verification.data &&
  new Date(verification.data.verified_at).getTime()<=now &&
  new Date(verification.data.expires_at).getTime()>now;
 return {enabled:true,verified,userId,requestStatus:(request.data?.status as AdultStatus['requestStatus'])??null};
}
