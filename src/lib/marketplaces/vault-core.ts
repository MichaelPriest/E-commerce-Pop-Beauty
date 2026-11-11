import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
export function encryptOAuthSecret(value:string,key:Buffer){
 if(key.length!==32||!value||value.length>8000)throw new Error('Dados de cofre inválidos.');
 const iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',key,iv);
 const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),
  data.toString('base64url')].join('.');
}
export function decryptOAuthSecret(encrypted:string,key:Buffer){
 if(key.length!==32)throw new Error('Chave do cofre inválida.');
 const parts=encrypted.split('.');
 if(parts.length!==4||parts[0]!=='v1')throw new Error('Formato de cofre inválido.');
 const iv=Buffer.from(parts[1],'base64url');
 const tag=Buffer.from(parts[2],'base64url');
 const data=Buffer.from(parts[3],'base64url');
 if(iv.length!==12||tag.length!==16||data.length<1||data.length>8500)
  throw new Error('Credencial cifrada inválida.');
 const decipher=createDecipheriv('aes-256-gcm',key,iv);
 decipher.setAuthTag(tag);
 return Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8');
}
