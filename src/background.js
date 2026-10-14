import {createExecutionEngine} from './execution-engine.js';
import {createRuntimeController} from './runtime-client.js';
import {getThread} from './workspaces.js';
import {validOrigin,normalizeSiteMode} from './site-permissions.js';
import {fetchOpenRouterModels,CATALOG_TTL_MS} from './models.js';
import {appendAudit,getAudit,getAuditByTab} from './audit.js';
import {getMemories,addMemory,removeMemory} from './memory.js';
import {nextCron,validateJob} from './cron.js';
import {ChromeBrowser,chromeTools} from './chrome-browser.js';
import {runAgent} from './agent.js';
import {normalizeSettings} from './providers.js';
import {listSkills,approveSkill,removeSkill,suggestSkill} from './skills.js';
import {ensureConversation,listConversations,getConversation,closeConversation,updateConversationUrl,reconcileConversationTabs} from './conversations.js';

const storage=chrome.storage.local;
const JOBS='navegaJobsV3';const MODELS='navegaModelsV3';const SITES='navegaSitePermissionsV1';
let auditQueue=Promise.resolve();
const log=(entry)=>{auditQueue=auditQueue.catch(()=>{}).then(()=>appendAudit(storage,entry));return auditQueue;};

async function syncModels(force=false){
  const saved=(await storage.get(MODELS))[MODELS];
  if(!force&&saved?.models?.length&&Date.now()-saved.updatedAt<CATALOG_TTL_MS)return {...saved,fromCache:true};
  try{
    const models=await fetchOpenRouterModels();const next={models,updatedAt:Date.now()};await storage.set({[MODELS]:next});
    await log({event:'models_synced',count:models.length});return next;
  }catch(e){if(saved?.models?.length)return {...saved,stale:true,error:String(e.message)};throw e;}
}
async function getSitePermissions(){return (await storage.get(SITES))[SITES]||{};}
async function setSitePermission(origin,mode){
  const site=validOrigin(origin);const accepted=normalizeSiteMode(mode);
  if(accepted!==mode)throw Error('Modo de acesso inválido.');
  const sites=await getSitePermissions();
  if(mode==='ask')delete sites[site];else sites[site]=mode;
  await storage.set({[SITES]:sites});
  await log({event:'site_permission_changed',origin:site,mode});
  return sites;
}
// Session lock is tab-scoped; separate conversations may run in different tabs.
let runQueue=Promise.resolve();
const locked=fn=>{const p=runQueue.catch(()=>{}).then(fn);runQueue=p;return p;};
async function allRuns(){return (await chrome.storage.session.get('navegaActiveRunsV2')).navegaActiveRunsV2||{};}
async function updateActiveRun(tabId,runId,patch){return locked(async()=>{
  const map=await allRuns();const current=map[tabId];
  if(current && current.runId!==runId)throw Error('Outra tarefa já controla esta aba.');
  let next={...current,tabId,runId,...patch};
  if(patch.extraOrigin){next.allowedOrigins=[...new Set([...(current?.allowedOrigins||[]),patch.extraOrigin])];delete next.extraOrigin;}
  map[tabId]=next;await chrome.storage.session.set({navegaActiveRunsV2:map});return next;
});}
async function removeActiveRun(tabId,runId){return locked(async()=>{const map=await allRuns();
  if(map[tabId]?.runId===runId){delete map[tabId];await chrome.storage.session.set({navegaActiveRunsV2:map});}
});}
const engine=createExecutionEngine({chrome,storage,log,getSites:getSitePermissions,setSite:setSitePermission,updateRun:updateActiveRun,removeRun:removeActiveRun,suggestSkill:(v)=>suggestSkill(storage,v),getTimeline:(tabId)=>getAuditByTab(storage,tabId,1200)});
const managedRuntime=createRuntimeController({chrome,storage,log});
async function getJobs(){return (await storage.get(JOBS))[JOBS]||[];}
async function upsertJob(input){
  const job=validateJob(input);
  if(job.backend&&job.backend!=='chrome')throw Error('Cron apenas no Chrome nativo.');
  const current=await chrome.tabs.get(job.tabId);
  if(new URL(current.url).origin!==job.origin)throw Error('O site da aba não corresponde à origem do agendamento.');
  if((await getSitePermissions())[job.origin]!=='allow')throw Error('Autorize permanentemente esse site antes de criar um cron.');
  const jobs=await getJobs(); const id=job.id||crypto.randomUUID();
  if(!jobs.some(x=>x.id===id)&&jobs.length>=10)throw Error('Limite de 10 tarefas agendadas.');
  const clean={id,tabId:job.tabId,origin:job.origin,url:new URL(current.url).origin+new URL(current.url).pathname,prompt:job.prompt,cron:job.cron,enabled:true,nextDueAt:nextCron(job.cron),
    createdAt:job.createdAt||new Date().toISOString(),lastResult:'',lastRun:null,lastError:''};
  await storage.set({[JOBS]:[...jobs.filter(x=>x.id!==id),clean]});
  await scheduleJob(clean);await log({event:'cron_created',jobId:id,tabId:job.tabId,cron:job.cron,origin:job.origin});return clean;
}
async function scheduleJob(job){
  await chrome.alarms.clear('navega_job_'+job.id);
  if(job.enabled)await chrome.alarms.create('navega_job_'+job.id,{when:nextCron(job.cron)});
}
async function deleteJob(id){const jobs=await getJobs();await storage.set({[JOBS]:jobs.filter(x=>x.id!==id)});
 await chrome.alarms.clear('navega_job_'+id);await log({event:'cron_deleted',jobId:id});}
async function updateJobResult(id,props){const jobs=await getJobs();await storage.set({[JOBS]:jobs.map(x=>x.id===id?{...x,...props}:x)});}
// Missed read-only schedules can run after Chrome reopens. No closed-Chrome automation is claimed.
const scheduledRunning=new Set();
async function runJob(id){
  if(scheduledRunning.has(id))return;
  const job=(await getJobs()).find(x=>x.id===id);if(!job||!job.enabled)return;
  scheduledRunning.add(id);
  let temporaryTabId=null;
  try{
    await scheduleJob(job);
    await updateJobResult(id,{nextDueAt:nextCron(job.cron)});
    const runId=crypto.randomUUID();let outcome='success',result='',executionTabId=job.tabId;
    await log({event:'cron_started',runId,jobId:id,tabId:job.tabId,origin:job.origin});
    try{
      if((await getSitePermissions())[job.origin]!=='allow')throw Error('Cron exige permissão persistente para o domínio.');
      const stored=await storage.get(['settings','savedKey']);const settings=normalizeSettings(stored.settings||{});
      if(settings.provider==='demo'||!stored.savedKey)throw Error('Cron exige chave salva e modelo configurado.');
      let tab=await chrome.tabs.get(job.tabId).catch(()=>null);
      if(tab && (!/^https?:\/\//.test(tab.url||'') || new URL(tab.url).origin!==job.origin || engine.isActive(tab.id)))tab=null;
      if(!tab){
        const url=job.url||job.origin;
        if(new URL(url).origin!==job.origin)throw Error('Destino do cron não corresponde ao domínio autorizado.');
        tab=await chrome.tabs.create({url,active:false});temporaryTabId=tab.id;
        const worker=new ChromeBrowser(tab.id);await worker.waitForTab(11000);
        tab=await chrome.tabs.get(tab.id);
      }
      if(new URL(tab.url).origin!==job.origin)throw Error('Redirecionamento para origem não autorizada.');
      executionTabId=tab.id;
      const browser=new ChromeBrowser(tab.id);await browser.initialize();
      const memories=await getMemories(storage,job.origin);
      const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),80000);
      try{
        const completion=await runAgent({userMessage:job.prompt,history:[],settings:{...settings,apiKey:stored.savedKey,approvalMode:'read_only',maxSteps:4,visionEnabled:false},
          adapter:browser,tools:chromeTools.filter(x=>x.function.name==='get_page'),signal:controller.signal,
          memory:memories.map(x=>x.text),onEvent:()=>{},requestApproval:async()=>false});
        result=completion.answer.slice(0,1500);
      }finally{clearTimeout(timeout);}
      await updateJobResult(id,{lastRun:new Date().toISOString(),lastResult:result,lastError:''});
    }catch(e){outcome='error';result=String(e.message||e).slice(0,180);
      await updateJobResult(id,{lastRun:new Date().toISOString(),lastError:result});}
    await log({event:'cron_finished',runId,jobId:id,tabId:executionTabId,outcome});
    try{await chrome.notifications.create('navega_'+id,{type:'basic',iconUrl:'icons/icon128.png',title:'NavegaAI · tarefa agendada',message:outcome==='success'?'Consulta concluída. Consulte o resultado em Cron.':`Falhou: ${result.slice(0,100)}`});}catch{}
  }finally{
    if(temporaryTabId!==null)await chrome.tabs.remove(temporaryTabId).catch(()=>{});
    scheduledRunning.delete(id);
  }
}

chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(()=>{});
chrome.runtime.onInstalled.addListener(async()=>{
  await chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(()=>{});
  await chrome.alarms.create('navega_models_refresh',{periodInMinutes:360});
  for(const job of await getJobs())await scheduleJob(job);
  syncModels().catch(()=>{});
});
chrome.runtime.onStartup.addListener(async()=>{
  await reconcileConversationTabs(storage,(await chrome.tabs.query({})).map(t=>t.id)).catch(()=>{});
  await chrome.alarms.create('navega_models_refresh',{periodInMinutes:360});
  for(const job of await getJobs()){
    if(job.enabled && job.nextDueAt && job.nextDueAt<=Date.now())void runJob(job.id).catch(()=>{});
    else await scheduleJob(job);
  }
  const previous=await allRuns();
  for(const info of Object.values(previous))await new ChromeBrowser(info.tabId).endVisual().catch(()=>{});
  await chrome.storage.session.remove('navegaActiveRunsV2');
});
chrome.tabs.onUpdated.addListener(async(tabId,change)=>{
  if(change.url){await updateConversationUrl(storage,tabId,change.url).catch(()=>{});}
  if(change.status!=='complete')return;
  const active=(await allRuns())[tabId];
  if(!active)return;
  const tab=await chrome.tabs.get(tabId).catch(()=>null);
  if(!tab||!/^https?:\/\//.test(tab.url||'')||!active.allowedOrigins?.includes(new URL(tab.url).origin)){
    await log({event:'run_origin_out_of_scope',runId:active.runId,tabId});return;
  }
  const browser=new ChromeBrowser(tabId);await browser.beginVisual().catch(()=>{});
});
chrome.tabs.onRemoved.addListener(async(tabId)=>{
  await engine.tabClosed(tabId);
  await closeConversation(storage,tabId);
  const active=(await allRuns())[tabId];
  if(active)await removeActiveRun(tabId,active.runId);
  await log({event:'tab_closed',tabId});
});
chrome.alarms.onAlarm.addListener(alarm=>{
  if(alarm.name==='navega_models_refresh')syncModels(true).catch(()=>{});
  else if(alarm.name.startsWith('navega_job_'))runJob(alarm.name.slice('navega_job_'.length)).catch(()=>{});
});
chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
  (async()=>{
    switch(msg?.type){
      case 'MODELS':return syncModels(!!msg.force);
      case 'CHAT_START':{
        const conversation=await ensureConversation(storage,msg.tabId);
        const opts=(await storage.get('settings')).settings||{};
        return opts.backend==='runtime'
          ? managedRuntime.start({tabId:msg.tabId,userMessage:msg.userMessage,conversationId:conversation.id})
          : engine.start({tabId:msg.tabId,userMessage:msg.userMessage});
      }
      case 'CHAT_STATUS':await ensureConversation(storage,msg.tabId);
        return (await getThread(storage,msg.tabId)).backend==='runtime'
          ? managedRuntime.query(msg.tabId):engine.query(msg.tabId);
      case 'CHAT_DECIDE':return (await getThread(storage,msg.tabId)).backend==='runtime'
          ? managedRuntime.approve(msg):engine.approve(msg);
      case 'CHAT_STOP':return (await getThread(storage,msg.tabId)).backend==='runtime'
          ? managedRuntime.stop(msg.tabId):engine.stop(msg.tabId);
      case 'CHAT_NEW':{
        const t=await chrome.tabs.create({url:'about:blank',active:true});
        const c=await ensureConversation(storage,t.id,{url:t.url});
        await chrome.sidePanel.setOptions({tabId:t.id,path:`src/panel.html?tab=${t.id}`,enabled:true});
        await log({event:'conversation_tab_created',tabId:t.id,conversationId:c.id});return {tabId:t.id,conversationId:c.id};
      }
      case 'CHAT_LIST':return listConversations(storage);
      case 'CHAT_REOPEN':{
        const c=await getConversation(storage,String(msg.conversationId||''));
        if(!c)throw Error('Conversa não encontrada.');
        if(c.tabId){const old=await chrome.tabs.get(c.tabId).catch(()=>null);if(old){await chrome.tabs.update(c.tabId,{active:true});return {tabId:c.tabId,conversationId:c.id,reused:true};}
          await closeConversation(storage,c.tabId);}
        const t=await chrome.tabs.create({url:c.lastUrl||'https://www.google.com/',active:true});
        await ensureConversation(storage,t.id,{restoreId:c.id,url:t.url});
        await chrome.sidePanel.setOptions({tabId:t.id,path:`src/panel.html?tab=${t.id}`,enabled:true});
        await log({event:'conversation_reopened',tabId:t.id,conversationId:c.id});return {tabId:t.id,conversationId:c.id,reused:false};
      }
      case 'SITE_LIST':return getSitePermissions();
      case 'SITE_SET':return setSitePermission(msg.origin,msg.mode);
      case 'AUDIT':return log(msg.entry);
      case 'AUDIT_LIST':return getAudit(storage);
      case 'AUDIT_QUERY':return getAuditByTab(storage,Number(msg.tabId));
      case 'JOBS':return getJobs();
      case 'JOB_ADD':return upsertJob(msg.job);
      case 'JOB_REMOVE':return deleteJob(msg.id);
      case 'SKILLS_LIST':return listSkills(storage,msg.origin||'');
      case 'SKILLS_APPROVE':return approveSkill(storage,msg.id);
      case 'SKILLS_REMOVE':return removeSkill(storage,msg.id);
      case 'MEMORY_LIST':return getMemories(storage,msg.origin);
      case 'MEMORY_ADD':return addMemory(storage,msg.origin,msg.text);
      case 'MEMORY_REMOVE':return removeMemory(storage,msg.origin,msg.id);
      default:throw Error('Comando desconhecido.');
    }
  })().then(data=>respond({ok:true,data}),e=>respond({ok:false,error:String(e.message||e).slice(0,300)}));
  return true;
});
