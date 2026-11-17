export const PROVIDERS = [
 'supabase', 'mp-test', 'mp-live', 'focus', 'melhor-envio-sandbox', 'melhor-envio-live',
] as const;

export type PreflightProvider = typeof PROVIDERS[number];
export type PreflightCard = {
 id:PreflightProvider;
 title:string;
 missing:string[];
 canCheck:boolean;
};
export type PreflightResult = {state:'ready'|'pending'|'blocked';message:string};

export const PRODUCTION_ENV_URL = 'https://vercel.com/michael-raimundos-projects/e-commerce-pope-beauty/settings/environment-variables';

export function integrationPreflight(env:Record<string,string|undefined>):PreflightCard[]{
 const present=(key:string)=>Boolean(env[key]?.trim());
 const focusEnvironment=env.FOCUS_NFE_ENVIRONMENT;
 const focusMode=focusEnvironment==='producao'||focusEnvironment==='homologacao';
 const focusToken=focusEnvironment==='producao'?'FOCUS_NFE_PRODUCAO_TOKEN':'FOCUS_NFE_HOMOLOGACAO_TOKEN';
 const definitions:[PreflightProvider,string,string[],string[]][]=[
  ['supabase','Supabase — acesso do servidor',['SUPABASE_SERVICE_ROLE_KEY'],[]],
  ['mp-test','Mercado Pago — conta TEST', ['MP_TEST_ACCESS_TOKEN','MP_TEST_SELLER_ID'],
   ['MP_TEST_WEBHOOK_SECRET','MP_TEST_WEBHOOK_ENABLED','MP_TEST_PREFERENCE_CREATION_ENABLED']],
  ['mp-live','Mercado Pago — produção',['MP_LIVE_ACCESS_TOKEN','MP_LIVE_SELLER_ID'],
   ['MP_LIVE_WEBHOOK_SECRET','MP_LIVE_WEBHOOK_ENABLED','MP_LIVE_SITE_ORIGIN','MP_LIVE_PAYMENT_LINKS_ENABLED']],
  ['focus','Focus NFe — '+(focusMode?focusEnvironment:'emissão'),['FOCUS_NFE_ENVIRONMENT',focusToken],[]],
  ['melhor-envio-sandbox','Melhor Envio — sandbox',['MELHOR_ENVIO_SANDBOX_TOKEN'],[]],
  ['melhor-envio-live','Melhor Envio — produção',['MELHOR_ENVIO_PRODUCTION_TOKEN'],
   ['MELHOR_ENVIO_LABEL_ENVIRONMENT','MELHOR_ENVIO_CONTACT_EMAIL','MELHOR_ENVIO_SENDER_PHONE']],
 ];
 return definitions.map(([id,title,query,operational])=>{
  const configured=(key:string)=>{
   if(key==='FOCUS_NFE_ENVIRONMENT')return focusMode;
   if(key==='MELHOR_ENVIO_LABEL_ENVIRONMENT')return env[key]==='producao';
   if(key==='MP_TEST_WEBHOOK_ENABLED'||key==='MP_TEST_PREFERENCE_CREATION_ENABLED')return env[key]==='verified-test-account-only';
   if(key==='MP_LIVE_WEBHOOK_ENABLED')return env[key]==='verified-live-account-only';
   if(key==='MP_LIVE_PAYMENT_LINKS_ENABLED')return env[key]==='internal-orders';
   return present(key);
  };
  return {id,title,missing:[...query,...operational].filter(key=>!configured(key)),canCheck:query.every(configured)};
 });
}
