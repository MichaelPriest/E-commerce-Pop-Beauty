export const FEED_POST_STATUSES={
 pending:'Aguardando aprovação',published:'Publicado',
 rejected:'Não aprovado',hidden:'Oculto'
} as const;
export type FeedStatus=keyof typeof FEED_POST_STATUSES;
export type FeedMediaKind='image'|'video';
export type FeedCategory={
 id:string;name:string;slug:string;parent_id:string|null;
 active:boolean;is_adult:boolean;
};
export type FeedProduct={
 id:string;name:string;slug:string;category_id:string;
 price_cents:number;image_url:string|null;
};
export type FeedPost={
 id:string;author_id:string;author_name:string;body:string;
 media_path:string|null;media_kind:FeedMediaKind|null;
 product_id:string|null;category_id:string|null;
 status:FeedStatus;
 created_at:string;updated_at:string;published_at:string|null;
};
export type FeedPostView=FeedPost&{
 media_url:string|null;product:FeedProduct|null;
 category:Pick<FeedCategory,'id'|'name'|'slug'|'parent_id'>|null;
};
export const FEED_IMAGE_TYPES=['image/jpeg','image/png','image/webp'] as const;
export const FEED_VIDEO_TYPES=['video/mp4','video/webm'] as const;
export const FEED_IMAGE_MAX_BYTES=5*1024*1024;
export const FEED_VIDEO_MAX_BYTES=25*1024*1024;
export const FEED_BODY_MAX=2000;
export function feedMediaInfo(file:{type:string;size:number}|null):
 {kind:FeedMediaKind;ext:string}|{error:string}|null{
 if(!file)return null;
 const image:{[key:string]:string}={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
 const video:{[key:string]:string}={'video/mp4':'mp4','video/webm':'webm'};
 if(image[file.type]){
  return file.size>0&&file.size<=FEED_IMAGE_MAX_BYTES?
   {kind:'image',ext:image[file.type]}:{error:'A imagem deve ter até 5 MB.'};
 }
 if(video[file.type]){
  return file.size>0&&file.size<=FEED_VIDEO_MAX_BYTES?
   {kind:'video',ext:video[file.type]}:{error:'O vídeo deve ter até 25 MB.'};
 }
 return {error:'Envie JPG, PNG, WebP, MP4 ou WebM.'};
}
export function validateFeedPost(body:unknown,file:{type:string;size:number}|null):string|null{
 if(typeof body!=='string')return 'Informe o texto da postagem.';
 if(body.length>FEED_BODY_MAX)return 'O texto deve ter no máximo 2.000 caracteres.';
 if(!body.trim()&&!file)return 'Inclua um texto, uma imagem ou um vídeo.';
 const media=feedMediaInfo(file);
 if(media&&'error' in media)return media.error;
 return null;
}
export function feedPage(raw:unknown):number{
 const num=Number(raw);
 return typeof raw==='string'&&/^[1-9][0-9]*$/.test(raw)&&
  Number.isSafeInteger(num)?Math.min(num,100):1;
}
export function feedCategoryIds(rootId:string,categories:FeedCategory[]):string[]{
 return [rootId,...categories.filter(c=>c.parent_id===rootId).map(c=>c.id)];
}
export function feedStatusLabel(value:string):string{
 return FEED_POST_STATUSES[value as FeedStatus]??'Desconhecido';
}
