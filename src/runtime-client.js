// Opt-in desktop runtime client. A separate Chromium profile is used by Python/Playwright.
// The extension's native Chrome backend remains the default.
import {getThread,threadKey,reduceThread} from './workspaces.js';
import {saveConversationSnapshot} from './conversations.js';
import {isContinuation,buildContinuation} from './continuation.js';
import {PROVIDERS} from './providers.js';

export function validateRuntimeUrl(url) {
  const parsed=new URL(String(url||''));
  if(parsed.protocol!=='http:'||!['127.0.0.1','localhost'].includes(parsed.hostname)||
    parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/'&&parsed.pathname!=='')
    throw Error('Runtime deve ser http://127.0.0.1:8765/ ou localhost, sem parâmetros.');
  return parsed.origin;
}
export async function runtimeRequest({url,token,path,method='GET',body,fetchFn=fetch}) {
  const root=validateRuntimeUrl(url);
  if(!token||token.length<20)throw Error('Configure o token de acesso local do Runtime nas configurações.');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetchFn(root+path,{method,signal:controller.signal,
      headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok)throw Error(`Runtime HTTP ${response.status}: ${(await response.text()).slice(0,180)}`);
    return response.json();
  }finally{clearTimeout(timer);}
}
export function createRuntimeController({storage,chrome,log}) {
  const queues=new Map();
  const change=(tabId,patch)=>{
    const previous=queues.get(tabId)||Promise.resolve();
    const pending=previous.catch(()=>{}).then(async()=>{
      const thread=await getThread(storage,tabId),next=reduceThread(thread,patch);
      // reduceThread deliberately persists these runtime-only metadata fields.
      await storage.set({[threadKey(tabId)]:next});
      await saveConversationSnapshot(storage,tabId,next);
      return next;
    });queues.set(tabId,pending);return pending;
  };
  async function config(){
    const local=(await storage.get(['settings','savedKey']));
    const session=(await chrome.storage.session.get(['runtimeToken','apiKey']));
    return {settings:local.settings||{},token:session.runtimeToken||'',apiKey:session.apiKey||local.savedKey||''};
  }
  async function start({tabId,userMessage,conversationId}) {
    const {settings,token,apiKey}=await config();
    if(!apiKey)throw Error('Configure a chave da API de IA para executar no Runtime local.');
    if(!conversationId)throw Error('Conversa não identificada.');
    const previous=await getThread(storage,tabId);
    if(previous.runtimeJobId&&!previous.runtimeFinalized&&['starting','running','approval','needs_review'].includes(previous.status)){
      // Unknown POST outcome must be resolved by looking up the SAME id.
      const reconciled=await query(tabId);
      if(['starting','running','approval','needs_review'].includes(reconciled.status))
        throw Error('Já existe uma tarefa possivelmente em execução no Runtime. Verifique a conexão e a auditoria antes de iniciar outra.');
    }
    let page=await chrome.tabs.get(tabId);
    let url=/^https?:\/\//.test(page.url||'')?page.url:'https://www.google.com/';
    const id=crypto.randomUUID();
    const prompt=isContinuation(userMessage)?buildContinuation(userMessage,previous,[]).prompt:userMessage;
    await change(tabId,{backend:'runtime',runtimeJobId:id,runtimeFinalized:false,runtimeSeq:0,runId:id,status:'starting',
      message:{role:'user',text:userMessage,at:Date.now()},error:''});
    await log({event:'runtime_requested',runId:id,tabId,backend:'managed_browser',model:settings.model});
    try{
      await runtimeRequest({url:settings.runtimeUrl||'http://127.0.0.1:8765/',token,path:'/tasks',method:'POST',body:{
        client_job_id:id,workspace:conversationId,prompt,url,model:settings.model||PROVIDERS[settings.provider]?.model||'',
        base_url:settings.baseURL||'https://openrouter.ai/api/v1',api_key:apiKey,
        approval_mode:settings.approvalMode,
        allowed_origins:[new URL(url).origin,...(settings.runtimeOrigins||'').split(',').map(x=>x.trim()).filter(Boolean)],
        allow_sensitive:false,
        resume_of:isContinuation(userMessage)&&['needs_review','interrupted','error','cancelled'].includes(previous.status)?(previous.runtimeJobId||null):null
      }});
      await change(tabId,{status:'running'});
    }catch(e){
      // POST response may be lost after server created the job. DO NOT resubmit with a new ID.
      await change(tabId,{status:'needs_review',error:'Conexão incerta com Runtime: '+String(e.message).slice(0,200)});
      throw e;
    }
    return {runId:id,tabId};
  }
  async function query(tabId){
    let thread=await getThread(storage,tabId);
    if(thread.backend!=='runtime'||!thread.runtimeJobId)return thread;
    const {settings,token}=await config();
    let remote;
    try{remote=await runtimeRequest({url:settings.runtimeUrl||'http://127.0.0.1:8765/',token,
      path:'/tasks/'+encodeURIComponent(thread.runtimeJobId)});}
    catch(e){
      // Runtime may be temporarily unavailable. Preserve job ID; never silently mark complete.
      await change(tabId,{status:'needs_review',error:'Runtime indisponível: '+String(e.message).slice(0,200)});
      return getThread(storage,tabId);
    }
    let last=thread.runtimeSeq||0;
    for(const ev of (remote.events||[]).filter(e=>e.seq>last).slice(0,100)){
      last=ev.seq;
      await log({event:'runtime_'+String(ev.event||'event').slice(0,60),runId:thread.runtimeJobId,tabId,
        step:ev.step,tool:ev.tool,outcome:ev.outcome,errorKind:ev.error_kind});
      await change(tabId,{event:{type:String(ev.event||'runtime_event'),name:ev.tool||'',step:ev.step,reason:ev.detail||''}});
    }
    const status={queued:'starting',running:'running',approval:'approval',completed:'completed',needs_review:'needs_review',
      interrupted:'needs_review',cancelled:'cancelled',error:'error'}[remote.status]||'needs_review';
    if(!thread.runtimeFinalized&&['completed','needs_review','cancelled','error'].includes(status)){
      await change(tabId,{message:{role:'agent',text:remote.answer||
          (status==='completed'?'Tarefa concluída no navegador gerenciado.':'Tarefa não concluída ou precisa de revisão. Veja a auditoria.'),at:Date.now()},
        runtimeFinalized:true});
    }
    await change(tabId,{status,runtimeSeq:last,approval:remote.approval||null,error:status==='needs_review'?'Resultado não confirmado; examine a auditoria do Runtime.':''});
    thread=await getThread(storage,tabId);
    return thread;
  }
  async function approve({tabId,runId,requestId,decision}) {
    const thread=await getThread(storage,tabId);
    if(thread.backend!=='runtime'||thread.runtimeJobId!==runId||!thread.approval||
       thread.approval.requestId!==requestId)throw Error('Aprovação não corresponde à execução ativa.');
    const {settings,token}=await config();
    const choice=['yes','approve','once','always'].includes(decision)||decision===true?'approve':'reject';
    await runtimeRequest({url:settings.runtimeUrl||'http://127.0.0.1:8765/',token,
      path:'/tasks/'+encodeURIComponent(runId)+'/decision',method:'POST',
      body:{request_id:requestId,decision:choice}});
    await change(tabId,{approval:null,status:'running'});
    return {ok:true};
  }
  async function stop(tabId){
    const thread=await getThread(storage,tabId);
    if(!thread.runtimeJobId)return {ok:true};
    const {settings,token}=await config();
    await runtimeRequest({url:settings.runtimeUrl||'http://127.0.0.1:8765/',token,
      path:'/tasks/'+encodeURIComponent(thread.runtimeJobId)+'/cancel',method:'POST'});
    return {ok:true};
  }
  return {start,query,approve,stop};
}
