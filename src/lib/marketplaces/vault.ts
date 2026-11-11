import 'server-only';
import {encryptOAuthSecret,decryptOAuthSecret} from './vault-core';
function encryptionKey(){
 const raw=process.env.MARKETPLACE_TOKEN_ENCRYPTION_KEY?.trim()??'';
 if(!/^[0-9a-fA-F]{64}$/.test(raw)){
  throw new Error('Cofre de marketplaces não configurado: cadastre a chave AES-256-GCM no servidor.');
 }
 return Buffer.from(raw,'hex');
}
export const encryptMarketplaceToken=(value:string)=>encryptOAuthSecret(value,encryptionKey());
export const decryptMarketplaceToken=(value:string)=>decryptOAuthSecret(value,encryptionKey());
export function marketplaceVaultConfigured(){
 return /^[0-9a-fA-F]{64}$/.test(
  process.env.MARKETPLACE_TOKEN_ENCRYPTION_KEY?.trim()??'');
}
