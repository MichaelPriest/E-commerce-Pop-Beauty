import {requireAdmin} from '@/lib/admin';
import {SettingsManager} from './settings-manager';
export const dynamic='force-dynamic';
export default async function AdminSettingsPage(){
 const sb=await requireAdmin();
 const [setting,requests,profiles,verified]=await Promise.all([
  sb.from('store_settings').select('adult_enabled').eq('id',1).maybeSingle(),
  sb.from('age_verification_requests').select('user_id,status,requested_at,reviewed_at').order('requested_at',{ascending:false}).limit(150),
  sb.from('profiles').select('id,display_name').limit(1000),
  sb.from('age_verifications').select('user_id,method,verified_at,expires_at').limit(1000)
 ]);
 const errors=[setting.error,requests.error,profiles.error,verified.error].filter(Boolean);
 if(errors.length)return <div className="container admin-workspace"><h1>Configurações</h1><p role="alert" className="form-error">Não foi possível carregar configurações: {errors[0]?.message}</p></div>;
 const nameById=new Map((profiles.data??[]).map(x=>[x.id,x.display_name]));
 const verificationById=new Map((verified.data??[]).map(x=>[x.user_id,x]));
 const rows=(requests.data??[]).map(x=>({
  ...x,display_name:nameById.get(x.user_id)||'Cliente sem nome',
  verified_at:verificationById.get(x.user_id)?.verified_at??null,
  expires_at:verificationById.get(x.user_id)?.expires_at??null
 }));
 return <SettingsManager enabled={!!setting.data?.adult_enabled} requests={rows}/>;
}
