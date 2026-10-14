// Catálogo público oficial OpenRouter. Não envia chaves nem dados do usuário.
export const MODELS_URL='https://openrouter.ai/api/v1/models';
export const CATALOG_REFRESH_MS=12*60*60*1000;
export function normalizeCatalog(payload){
  if(!Array.isArray(payload?.data)) throw Error('Catálogo OpenRouter inválido.');
  const entries=payload.data.filter(m=>m&&typeof m.id==='string'&&m.id.length<190)
    .map(m=>({id:m.id,name:String(m.name||m.id).slice(0,180),tools:Array.isArray(m.supported_parameters)?m.supported_parameters.includes('tools'):false,
      context:Number(m.context_length)||0,pricing:{prompt:String(m.pricing?.prompt||'0'),completion:String(m.pricing?.completion||'0')}}));
  if(!entries.length) throw Error('Catálogo OpenRouter vazio.');
  return entries.sort((a,b)=>a.id.localeCompare(b.id));
}
export async function fetchCatalog({fetcher=fetch,signal}={}){
  const response=await fetcher(MODELS_URL,{signal,headers:{Accept:'application/json'}});
  if(!response.ok) throw Error(`OpenRouter retornou HTTP ${response.status}`);
  return {models:normalizeCatalog(await response.json()),fetchedAt:Date.now()};
}
