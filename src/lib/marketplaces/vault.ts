import 'server-only';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
function encryptionKey(){
 const raw=process.env.MARKETPLACE_TOKEN_ENCRYPTION_KEY?.trim()??'';
 if(!/^[0-9a-fA-F]{64}$/.test(raw)){
  throw new Error('Cofre de marketplaces não configurado: cadastre a chave AES-256-GCM no servidor.');
 }
 return Buffer.from(raw,'hex');
}
export function encryptMarketplaceToken(value:string){
 if(!value||value.length>8000)throw new Error('Credencial inválida.');
 const iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);
 const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),
  data.toString('base64url')].join('.');
}
export function decryptMarketplaceToken(encrypted:string){
 const parts=encrypted.split('.');
 if(parts.length!==4||parts[0]!=='v1')throw new Error('Credencial cifrada incompatível.');
 const iv=Buffer.from(parts[1],'base64url');
 const tag=Buffer.from(parts[2],'base64url');
 const data=Buffer.from(parts[3],'base64url');
 if(iv.length!==12||tag.length!==16||data.length<1||data.length>8500)
  throw new Error('Credencial cifrada inválida.');
 const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),iv);
 decipher.setAuthTag(tag);
 return Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8');
}
export function marketplaceVaultConfigured(){
 return /^[0-9a-fA-F]{64}$/.test(
  process.env.MARKETPLACE_TOKEN_ENCRYPTION_KEY?.trim()??'');
}
