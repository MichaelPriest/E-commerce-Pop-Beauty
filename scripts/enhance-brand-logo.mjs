/**
 * Generate faithful high-resolution *raster* derivatives of the existing Popê Beauty logo.
 * Never redraws/replaces the artwork or changes the words or brand palette.
 *
 * Original source: public/logo.webp (96x96).
 * Output is upscaled with Lanczos3 and light edge enhancement; this does not
 * magically restore detail that was missing from the source image.
 */
import sharp from 'sharp';
import {access,stat} from 'node:fs/promises';
import {resolve} from 'node:path';

const original=resolve('public/logo.webp');
await access(original);
const source=sharp(original,{failOn:'error'});
const metadata=await source.metadata();
if(metadata.width!==96||metadata.height!==96){
  throw new Error('O arquivo original mudou; revise as dimensões antes de regenerar os logos.');
}
const targets=[
 {size:512,file:'public/logo-hd-512.webp'},
 {size:1024,file:'public/logo-hd.webp'}
];
for(const {size,file} of targets){
 const output=resolve(file);
 await sharp(original)
  .resize({width:size,height:size,kernel:'lanczos3',fit:'fill',withoutEnlargement:false})
  .sharpen({sigma:0.7,m1:0.8,m2:2})
  .webp({quality:92,effort:6})
  .toFile(output);
 const info=await stat(output);
 if(info.size<1000)throw new Error('Otimização produziu imagem inesperadamente pequena.');
 console.log('[Popê Beauty] Logo original preservado; logo HD '+size+'x'+size+' gerado ('+info.size+' bytes).');
}
