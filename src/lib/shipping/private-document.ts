/** Conferência defensiva dos PDFs oficiais recebidos no futuro.
 * Não verifica assinatura do prestador ou autenticidade do comprovante postal.
 * Essas verificações pertencem ao adaptador homologado, antes de persistir o objeto.
 */
import {createHash} from 'node:crypto';

export const SHIPPING_PDF_BUCKET='pope-shipping-private';
export const MAX_SHIPPING_PDF_BYTES=8*1024*1024;
const id=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha=/^[a-f0-9]{64}$/;

export function canonicalShippingPdfPath(documentId:string,orderId:string,requestId:string){
 if(![documentId,orderId,requestId].every(x=>id.test(x)))return null;
 return `orders/${orderId.toLowerCase()}/requests/${requestId.toLowerCase()}/${documentId.toLowerCase()}.pdf`;
}
export function validateShippingPdfDocument(input:{
 documentId:string;orderId:string;requestId:string;objectPath:string;
 bucketId:string;expectedSha256:string;bytes:Uint8Array;
}):boolean{
 const path=canonicalShippingPdfPath(input.documentId,input.orderId,input.requestId);
 if(!path||input.bucketId!==SHIPPING_PDF_BUCKET||input.objectPath!==path||
    !sha.test(input.expectedSha256))return false;
 const bytes=input.bytes;
 if(bytes.length<16||bytes.length>MAX_SHIPPING_PDF_BYTES)return false;
 const header=Buffer.from(bytes.subarray(0,8)).toString('latin1');
 if(!header.startsWith('%PDF-'))return false;
 // Trailing EOF check is a lightweight corruption guard, not a full PDF parser.
 const trailer=Buffer.from(bytes.subarray(Math.max(0,bytes.length-2048))).toString('latin1');
 if(!trailer.includes('%%EOF'))return false;
 const actual=createHash('sha256').update(bytes).digest('hex');
 return actual===input.expectedSha256;
}
