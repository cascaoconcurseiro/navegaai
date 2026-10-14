// OpenRouter public catalog: do not guess model IDs or impose a fixed shortlist.
export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
export const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;
export function normalizeModels(json) {
  if (!Array.isArray(json?.data)) throw Error('Catálogo OpenRouter inválido.');
  return json.data.filter(x=>x && typeof x.id==='string' && x.id.length<180)
    .map(x=>({id:x.id,name:String(x.name||x.id).slice(0,170),context:x.context_length||0,
      tools:Array.isArray(x.supported_parameters)&&x.supported_parameters.includes('tools'),
      vision:Array.isArray(x.architecture?.input_modalities)&&x.architecture.input_modalities.includes('image'),
      supported_parameters:x.supported_parameters||[],
      promptPrice:String(x.pricing?.prompt||'0'),completionPrice:String(x.pricing?.completion||'0')}))
    .sort((a,b)=>a.id.localeCompare(b.id));
}
export async function fetchOpenRouterModels({fetchFn=fetch,key='',signal}={}){
  const r=await fetchFn(OPENROUTER_MODELS_URL,{headers:{'Accept':'application/json',...(key?{Authorization:`Bearer ${key}`}:{})},signal});
  if(!r.ok) throw Error(`OpenRouter catálogo HTTP ${r.status}`);
  return normalizeModels(await r.json());
}
export function searchModels(models,term='',toolsOnly=false){
  const q=term.toLowerCase().trim();return models.filter(x=>(!toolsOnly||x.tools)&&(!q||(x.id+' '+x.name).toLowerCase().includes(q)));
}
