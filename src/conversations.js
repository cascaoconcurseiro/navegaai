// Durable conversation identity is independent of Chrome tab IDs.
// Only the background worker mutates this index. A module-level queue serializes writes.
const INDEX='navegaConversationIndexV1';
const SNAP='navegaConversationSnapshotV1:';
const TAB_PREFIX='navegaThreadV1:';
let queue=Promise.resolve();
function exclusive(fn){const next=queue.catch(()=>{}).then(fn);queue=next;return next;}
function initial(){return {tabs:{},conversations:{}};}
function cleanUrl(input){try{const u=new URL(input);return ['https:','http:'].includes(u.protocol)?u.origin+u.pathname+u.search:'';}catch{return '';}}
export async function ensureConversation(storage,tabId,options={}){
 if(!Number.isInteger(tabId)||tabId<1)throw Error('Aba inválida.');
 return exclusive(async()=>{
  const data=(await storage.get(INDEX))[INDEX]||initial();
  if(!options.restoreId && data.tabs[String(tabId)] && data.conversations[data.tabs[String(tabId)]])return data.conversations[data.tabs[String(tabId)]];
  let id=options.restoreId||data.tabs[String(tabId)];
  if(id && !data.conversations[id])id=null;
  if(!id){id=crypto.randomUUID();data.conversations[id]={id,title:'Nova conversa',createdAt:Date.now(),updatedAt:Date.now(),tabId,status:'idle',lastUrl:cleanUrl(options.url)};}
  else data.conversations[id]={...data.conversations[id],tabId,updatedAt:Date.now(),status:'idle',lastUrl:cleanUrl(options.url)||data.conversations[id].lastUrl||''};
  data.tabs[String(tabId)]=id;
  let prior=(await storage.get(TAB_PREFIX+tabId))[TAB_PREFIX+tabId];
  if(!prior){prior=(await storage.get(SNAP+id))[SNAP+id];if(prior){prior={...prior,tabId,threadId:id,runId:null,approval:null,status:'idle',version:(prior.version||0)+1};await storage.set({[TAB_PREFIX+tabId]:prior});}}
  if(!prior)await storage.set({[TAB_PREFIX+tabId]:{tabId,threadId:id,messages:[],history:[],status:'idle',runId:null,approval:null,version:0}});
  await storage.set({[INDEX]:data});return data.conversations[id];
 });
}
export async function saveConversationSnapshot(storage,tabId,thread){
 return exclusive(async()=>{
  const data=(await storage.get(INDEX))[INDEX]||initial();
  const id=data.tabs[String(tabId)];if(!id||!data.conversations[id])return null;
  const current=data.conversations[id];
  const latestUser=thread.messages?.filter(m=>m.role==='user').at(-1)?.text;
  if(latestUser && current.title==='Nova conversa')current.title=String(latestUser).slice(0,65);
  current.updatedAt=Date.now();current.status=thread.status||current.status;
  // Persistent snapshot survives Chrome tab closure, but in-flight tasks are not resumed automatically.
  await storage.set({[SNAP+id]:{...thread,threadId:id},[INDEX]:data});return id;
 });
}
export async function listConversations(storage){const data=(await storage.get(INDEX))[INDEX]||initial();return Object.values(data.conversations).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,150);}
export async function getConversation(storage,id){const data=(await storage.get(INDEX))[INDEX]||initial();return data.conversations[id]||null;}
export async function closeConversation(storage,tabId){return exclusive(async()=>{
 const data=(await storage.get(INDEX))[INDEX]||initial();const id=data.tabs[String(tabId)];if(!id)return false;
 const state=(await storage.get(TAB_PREFIX+tabId))[TAB_PREFIX+tabId];
 const snap=(await storage.get(SNAP+id))[SNAP+id];
 const freshest=(state?.version||0)>=(snap?.version||0)?state:snap;
 if(freshest)await storage.set({[SNAP+id]:{...freshest,threadId:id,runId:null,approval:null,status:'closed'}});
 delete data.tabs[String(tabId)];if(data.conversations[id])data.conversations[id]={...data.conversations[id],tabId:null,updatedAt:Date.now(),status:'closed'};
 await storage.set({[INDEX]:data});return true;
});}
export async function updateConversationUrl(storage,tabId,url){return exclusive(async()=>{
 const data=(await storage.get(INDEX))[INDEX]||initial();const id=data.tabs[String(tabId)];const value=cleanUrl(url);
 if(!id||!value)return;data.conversations[id].lastUrl=value;await storage.set({[INDEX]:data});
});}
export const conversationKeys={INDEX,SNAP,TAB_PREFIX};

export async function reconcileConversationTabs(storage,openTabIds){
 const present=new Set(openTabIds);
 return exclusive(async()=>{
  const data=(await storage.get(INDEX))[INDEX]||initial();let changed=0;
  for(const [key,id] of Object.entries(data.tabs)){
   if(present.has(Number(key)))continue;
   delete data.tabs[key];changed++;
   if(data.conversations[id]){
    data.conversations[id].tabId=null;data.conversations[id].status='closed';
    const saved=(await storage.get(TAB_PREFIX+key))[TAB_PREFIX+key];
    const snapshot=(await storage.get(SNAP+id))[SNAP+id];
    if(saved&&(!snapshot||(saved.version||0)>(snapshot.version||0)))await storage.set({[SNAP+id]:{...saved,runId:null,approval:null,status:'closed'}});
   }
  }
  if(changed)await storage.set({[INDEX]:data});return changed;
 });
}
