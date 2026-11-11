import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {decryptMarketplaceToken,encryptMarketplaceToken} from './vault';
import {refreshMarketplaceToken,type MarketplaceChannel} from './provider-auth';

export type MarketplaceAccount={
 id:string;channel:MarketplaceChannel;external_account_id:string;
 display_name:string;status:'connected'|'disconnected'|'needs_reauth';
 token_expires_at:string|null;last_synced_at:string|null;last_error:string|null;
};
export type AdminDb=Awaited<ReturnType<typeof createClient>>;

export async function marketplaceAdminSession():Promise<AdminDb|null>{
 const sb=await createClient();
 const {data:auth,error}=await sb.auth.getClaims();
 if(error||!auth?.claims?.sub)return null;
 const {data:profile}=await sb.from('profiles').select('role')
  .eq('id',auth.claims.sub).maybeSingle();
 return profile?.role==='admin'?sb:null;
}

export async function marketplaceAccessToken(sb:AdminDb,account:MarketplaceAccount){
 if(account.status!=='connected')throw new Error('Conta não está conectada.');
 const {data,error}=await sb.rpc('read_marketplace_encrypted_tokens',{
  p_connection_id:account.id
 });
 if(error||!data||typeof data!=='object')
  throw new Error('Credenciais do marketplace indisponíveis.');
 const vault=data as {access?:string;refresh?:string;revision?:number};
 if(!vault.access||!vault.refresh||!Number.isSafeInteger(vault.revision))
  throw new Error('Credenciais inválidas no cofre.');
 const access=decryptMarketplaceToken(vault.access);
 if(account.token_expires_at&&
  new Date(account.token_expires_at).getTime()>Date.now()+10*60*1000){
  return access;
 }
 // Tokens dos dois provedores podem rotacionar: nunca reutilizar refresh anterior.
 const fresh=await refreshMarketplaceToken(
  account.channel,decryptMarketplaceToken(vault.refresh),account.external_account_id
 );
 const {error:rotateError}=await sb.rpc('rotate_marketplace_encrypted_tokens',{
  p_id:account.id,p_revision:vault.revision,
  p_access_cipher:encryptMarketplaceToken(fresh.access),
  p_refresh_cipher:encryptMarketplaceToken(fresh.refresh),
  p_expires:new Date(Date.now()+fresh.expiresIn*1000).toISOString()
 });
 if(rotateError)throw new Error(
  'Token foi renovado mas não pôde ser persistido; reconecte a conta antes de nova consulta.');
 return fresh.access;
}
