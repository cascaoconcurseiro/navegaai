const KEY='navegaMemoryV3';
export function siteOrigin(raw){let u;try{u=new URL(raw);}catch{return '';};return /^https?:$/.test(u.protocol)?u.origin:'';}
export async function getMemories(storage,origin){const data=(await storage.get(KEY))[KEY]||{};return (data[origin]||[]).slice(0,30);}
export async function addMemory(storage,origin,text){
 if(!siteOrigin(origin)||siteOrigin(origin)!==origin)throw Error('Origem inválida.');
 const content=String(text||'').trim();if(!content||content.length>800)throw Error('Memória deve ter de 1 a 800 caracteres.');
 const data=(await storage.get(KEY))[KEY]||{};
 data[origin]=[...(data[origin]||[]),{id:crypto.randomUUID(),at:new Date().toISOString(),text:content}].slice(-30);
 await storage.set({[KEY]:data});return data[origin];
}
export async function removeMemory(storage,origin,id){const data=(await storage.get(KEY))[KEY]||{};data[origin]=(data[origin]||[]).filter(x=>x.id!==id);await storage.set({[KEY]:data});return data[origin];}
