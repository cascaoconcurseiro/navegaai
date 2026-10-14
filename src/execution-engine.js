import {ChromeBrowser,chromeTools} from './chrome-browser.js';
import {runAgent} from './agent.js';
import {runDemo} from './demo.js';
import {normalizeSettings} from './providers.js';
import {getMemories} from './memory.js';
import {getThread,threadKey,reduceThread} from './workspaces.js';
import {saveConversationSnapshot} from './conversations.js';
import {prepareConversationTab} from './tab-readiness.js';
import {diagnoseRun} from './recovery.js';
import {inspectInterruptedRun} from './interrupted-run.js';
import {buildContinuation,isContinuation} from './continuation.js';

// The side panel is a client. In-flight browser actions are owned by the extension worker.
// MV3 can still suspend a worker: do not claim durable closed-browser execution.
export function createExecutionEngine({chrome,storage,log,getSites,setSite,updateRun,removeRun,suggestSkill=async()=>null,getTimeline=async()=>[]}){
  const running=new Map(),writes=new Map(),starting=new Set();
  const change=(tabId,patch)=>{
    const prior=writes.get(tabId)||Promise.resolve();
    const next=prior.catch(()=>{}).then(async()=>{
      const old=await getThread(storage,tabId);
      const updated=reduceThread(old,patch);
      await storage.set({[threadKey(tabId)]:updated});
      if(patch.message||patch.history||patch.status||('error' in patch)||('runId' in patch))await saveConversationSnapshot(storage,tabId,updated);
      return updated;
    });
    writes.set(tabId,next);return next;
  };
  async function grantSite(run,origin){
    const sites=await getSites();
    if(sites[origin]==='block')throw Error('O site '+origin+' foi bloqueado nas configurações.');
    if(sites[origin]==='allow')return true;
    if(run.settings.approvalMode==='skip'||run.settings.approvalMode==='auto'){
      await log({event:'site_auto_scoped',runId:run.id,tabId:run.tabId,origin,mode:run.settings.approvalMode});
      return true;
    }
    const choice=await ask(run,{kind:'site',origin,label:'Autorizar o site '+origin,detail:'Este domínio será utilizado na mesma aba desta conversa.'});
    if(choice==='always')await setSite(origin,'allow');
    if(choice!=='always'&&choice!=='once')return false;
    return true;
  }
  async function ask(run,req){
    if(run.controller.signal.aborted)throw Error('Cancelado pelo usuário.');
    if(run.pending)throw Error('Existe uma aprovação pendente nesta tarefa.');
    const id=crypto.randomUUID();
    await change(run.tabId,{status:'approval',approval:{...req,requestId:id,runId:run.id,tabId:run.tabId}});
    await log({event:'approval_requested',runId:run.id,tabId:run.tabId,kind:req.kind,origin:req.origin,tool:req.name});
    return await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        if(run.pending?.id===id){run.pending=null;change(run.tabId,{approval:null,status:'running'}).catch(()=>{});resolve('deny');}
      },120000);
      run.pending={id,resolve:x=>{clearTimeout(timer);run.pending=null;change(run.tabId,{approval:null,status:'running'}).catch(()=>{});resolve(x);},reject};
    });
  }
  async function start({tabId,userMessage}){
    if(!Number.isInteger(tabId)||tabId<1)throw Error('Aba inválida.');
    if(running.has(tabId)||starting.has(tabId))throw Error('Esta conversa já está executando uma tarefa.');
    starting.add(tabId);
    try{
    const msg=String(userMessage||'').trim();if(!msg||msg.length>12000)throw Error('Mensagem vazia ou muito longa.');
    let prepared;
    try{prepared=await prepareConversationTab(chrome,tabId,{allowBlankNavigation:true});}
    catch(error){
      const reason=String(error?.message||error).slice(0,400);
      await change(tabId,{message:{role:'user',text:msg,at:Date.now()},status:'error',runId:null,error:reason}).catch(()=>{});
      await change(tabId,{message:{role:'error',text:reason,at:Date.now()}}).catch(()=>{});
      await log({event:'run_preflight_failed',tabId,reason,requestPreview:msg.slice(0,600)}).catch(()=>{});
      throw error;
    }
    const {tab,bootstrapped,navigationOnly=false}=prepared;
    if(bootstrapped)await log({event:'conversation_tab_prepared',tabId,origin:new URL(tab.url).origin});
    const origin=navigationOnly?null:new URL(tab.url).origin;
    if(navigationOnly)await log({event:'conversation_navigation_ready',tabId});
    const local=await storage.get(['settings','savedKey']);
    const session=await chrome.storage.session.get(['apiKey']);
    const settings=normalizeSettings(local.settings||{});
    settings.apiKey=session.apiKey||local.savedKey||'';
    if(settings.backend!=='chrome')throw Error('Somente o motor Chrome está isolado por aba nesta versão.');
    const run={id:crypto.randomUUID(),tabId,settings,controller:new AbortController(),pending:null,origin};
    running.set(tabId,run);
    const old=await getThread(storage,tabId);
    const continuation=buildContinuation(msg,old,isContinuation(msg)?await getTimeline(tabId).catch(()=>[]):[]);
    await change(tabId,{backend:'chrome',runtimeJobId:null,runtimeFinalized:false,message:{role:'user',text:msg,at:Date.now()},status:'starting',runId:run.id,error:''});
    try {
      await log({event:'run_requested',runId:run.id,tabId,origin,model:settings.model,approvalMode:settings.approvalMode,requestPreview:msg.slice(0,600)});
    }catch(error){
      running.delete(tabId);
      const detail='Auditoria indisponível: nenhuma ação foi executada. '+String(error.message||error).slice(0,160);
      await change(tabId,{status:'error',runId:null,error:detail,message:{role:'error',text:detail,at:Date.now()}});
      throw Error(detail);
    }
    if(continuation.resumed)await log({event:'conversation_resumed',runId:run.id,tabId,previousStatus:old.status});
    void execute(run,continuation.prompt,old.history).catch(async error=>{
      // A worker failure must never disappear behind a detached promise.
      const message=String(error?.message||error).slice(0,400);
      await change(tabId,{status:'error',runId:null,error:message,message:{role:'error',text:'Falha interna de execução: '+message,at:Date.now()}}).catch(()=>{});
      await log({event:'execution_crashed',runId:run.id,tabId,error:message}).catch(()=>{});
      running.delete(tabId);
    });
    return {runId:run.id,tabId};
    }finally{starting.delete(tabId);}
  }
  async function execute(run,msg,history){
    const {tabId}=run;let visualStarted=false;let browser;let runErrors=0;
    // Hard run budget. Per-request API timeouts are insufficient for long loops.
    const timeout=setTimeout(()=>run.controller.abort('run_timeout'),Math.max(60_000,Math.min(900_000,run.settings.maxRuntimeMs||480_000)));
    const pendingAudits=[];const runStart=Date.now();
    try{
      const okay=run.origin===null||await grantSite(run,run.origin);
      if(!okay)throw Error('Acesso ao site não autorizado.');
      let realInput=false;
      if(run.settings.realInput&&chrome.runtime.getManifest().permissions.includes('debugger')){
        const choice=await ask(run,{kind:'cdp',label:'Habilitar CDP nesta execução?',detail:'Acesso avançado de depuração ao Chrome. Alto risco.'});
        realInput=choice==='yes';
      }
      if(run.controller.signal.aborted)throw Error('Cancelado.');
      // Browser only receives references to the current tab. New tabs are separate conversations.
      browser=new ChromeBrowser(tabId,{runId:run.id,realInput,authorizeOrigin:async(origin)=>{
        const allowed=await grantSite(run,origin);
        if(allowed)await updateRun(tabId,run.id,{extraOrigin:origin});
        return allowed;
      }});
      await browser.initialize();
      await updateRun(tabId,run.id,{origin:run.origin,cdpGranted:realInput,allowedOrigins:run.origin?[run.origin]:[]});
      if(run.origin){await browser.beginVisual();visualStarted=true;}
      await change(tabId,{status:'running'});
      await log({event:'run_started',runId:run.id,tabId,origin:run.origin,mode:run.settings.approvalMode,model:run.settings.model,cdpGranted:realInput});
      let lastDraftFlush=0;
      const onEvent=(ev)=>{
        if(ev.type==='model_delta' && Date.now()-lastDraftFlush>350){lastDraftFlush=Date.now();change(tabId,{draft:ev.text}).catch(()=>{});}
        if(ev.type==='tool_error'||ev.type==='observation'&&ev.ok===false)runErrors++;
        if(ev.type==='tool_start'||ev.type==='tool_error'||ev.type==='tool_success'||ev.type==='approval'||ev.type==='policy'||ev.type==='observation'||ev.type==='thinking'||ev.type==='duration'||ev.type==='model_start'||ev.type==='model_done'||ev.type==='usage'||ev.type==='verification_failed'||ev.type==='recovery_attempt'||ev.type==='recovery_success'||ev.type==='recovery_stopped'||ev.type==='context_compacted'||ev.type==='proof_linked'||ev.type==='indeterminate_action'||ev.type==='no_visible_change'){
          const safe={type:ev.type,name:ev.name,step:ev.step,stepId:ev.stepId,actionStepId:ev.actionStepId,ms:ev.ms,risk:ev.risk,reason:ev.reason,error:ev.error,ok:ev.ok,decision:ev.decision,args:ev.args,result:ev.result};
          change(tabId,{event:safe}).catch(()=>{});
        }
        if(ev.type==='answer')change(tabId,{draft:'',message:{role:'agent',text:String(ev.text||'').slice(0,10000),at:Date.now()}}).catch(()=>{});
        if(ev.type!=='thinking'&&ev.type!=='model_delta'){
          const record=Promise.resolve().then(()=>log({event:'agent_'+ev.type,runId:run.id,tabId,name:ev.name,risk:ev.risk,ms:ev.ms,step:ev.step,stepId:ev.stepId,error:ev.error,decision:ev.decision,actionStepId:ev.actionStepId,reason:ev.reason,usage:ev.usage,operation:ev.args,outcome:ev.result,failureKind:ev.failureKind}));
          const handled=record.catch(e=>{
            runErrors++;
            change(tabId,{event:{type:'audit_error',error:'Falha ao registrar auditoria: '+String(e.message||e).slice(0,200)}}).catch(()=>{});
            if(ev.type==='tool_start')throw e; // stop before performing an unaudited action
          });
          pendingAudits.push(handled);
          if(ev.type==='tool_start')return handled;
        }
      };
      const requestApproval=async({name,args,detail})=>(await ask(run,{kind:'action',name,label:'Autorizar '+name+'?',detail:String(detail||'').slice(0,1300)}))==='yes';
      const memory=await getMemories(storage,run.origin);
      let resultInfo=null;
      if(run.settings.provider==='demo'){
        resultInfo=await runDemo({userMessage:msg,adapter:browser,settings:run.settings,signal:run.controller.signal,onEvent,requestApproval});
      }else{
        const result=await runAgent({userMessage:msg,history,settings:run.settings,adapter:browser,tools:chromeTools.filter(t=>run.settings.visionEnabled||t.function.name!=='capture_viewport'),signal:run.controller.signal,
          onEvent,requestApproval,memory:memory.map(x=>x.text)});
        resultInfo=result;const next=[...history,{role:'user',content:msg},{role:'assistant',content:result.answer}].slice(-12);
        await change(tabId,{history:next});
      }
      // Drain all asynchronous audit records before computing the final outcome.
      const flushed=await Promise.allSettled(pendingAudits);
      if(flushed.some(result=>result.status==='rejected'))runErrors++;
      const diagnosis=diagnoseRun(resultInfo?.metrics||{});
      const partial=runErrors>0||Boolean(resultInfo?.metrics?.unverifiedCount)||Boolean(resultInfo?.metrics?.unresolvedWeakEvidenceCount)||Boolean(resultInfo?.metrics?.indeterminateDispatches)||resultInfo?.maxStepsReached===true||resultInfo?.recoveryStopped===true||Boolean(resultInfo?.metrics?.unfulfilledAction)||
        Boolean(resultInfo?.metrics?.unresolvedWeakEvidenceCount)||Boolean(resultInfo?.metrics?.pendingVerification)||
        Boolean(resultInfo?.metrics?.mutations&&!resultInfo?.metrics?.verifiedProofs);
      const outcome=partial?'needs_review':'completed';
      await change(tabId,{status:outcome,draft:''});
      if(outcome==='completed'&&resultInfo?.metrics?.verifiedProofs>0){
        await suggestSkill({origin:run.origin,prompt:msg,verifiedProofs:resultInfo.metrics.verifiedProofs,sourceRunId:run.id}).catch(e=>log({event:'skill_suggestion_failed',runId:run.id,tabId,error:String(e.message||e).slice(0,160)}));
      }
      await log({event:'run_finished',runId:run.id,tabId,outcome,errors:runErrors,metrics:resultInfo?.metrics||{},diagnosis,durationMs:Date.now()-runStart});
    }catch(error){
      const message=String(error?.message||error).slice(0,500);
      const timedOut=run.controller.signal.reason==='run_timeout';
      const effectiveMessage=timedOut?'Tempo máximo de execução excedido. Ações pendentes podem ter ocorrido; confira a auditoria antes de repetir.':message;
      await change(tabId,{status:timedOut?'error':run.controller.signal.aborted?'cancelled':'error',draft:'',error:effectiveMessage,
        message:{role:'error',text:effectiveMessage,at:Date.now()}});
      await log({event:'run_finished',runId:run.id,tabId,outcome:timedOut?'timeout':'error',error:effectiveMessage,durationMs:Date.now()-runStart});
    }finally{
      clearTimeout(timeout);
      if(run.pending){run.pending.resolve('deny');}
      await writes.get(tabId)?.catch(()=>{});
      if(visualStarted)await browser.endVisual().catch(()=>{});
      await removeRun(tabId,run.id);
      running.delete(tabId);
      await change(tabId,{runId:null,approval:null});
    }
  }
  async function approve({tabId,runId,requestId,decision}){
    const run=running.get(tabId);
    if(!run||run.id!==runId||run.pending?.id!==requestId)throw Error('A solicitação já expirou.');
    if(!['yes','deny','once','always'].includes(decision))throw Error('Decisão inválida.');
    await log({event:'approval_decided',runId,tabId,requestId,decision});
    run.pending.resolve(decision);return {ok:true};
  }
  async function stop(tabId){
    const run=running.get(tabId);
    if(!run)return {ok:true};
    run.controller.abort();if(run.pending)run.pending.resolve('deny');
    await log({event:'run_cancel_requested',runId:run.id,tabId});return {ok:true};
  }
  async function query(tabId){
    const thread=await getThread(storage,tabId);
    if(['starting','running','approval'].includes(thread.status)&&!running.has(tabId)&&!starting.has(tabId)){
      const state=inspectInterruptedRun(await getTimeline(tabId).catch(()=>[]),thread.runId);
      const error=state.actionMayHaveOccurred
        ? 'Execução interrompida com ação possivelmente aplicada, mas sem resposta registrada. NÃO repita envios, publicações ou ações irreversíveis sem verificar o site. Consulte a auditoria.'
        : 'Execução interrompida após reinicialização do Chrome. Revise a aba antes de retomar; nenhuma repetição automática será feita.';
      await log({event:'run_interrupted_diagnosed',runId:thread.runId,tabId,uncertainSteps:state.indeterminate.map(x=>({stepId:x.stepId,name:x.name})),actionMayHaveOccurred:state.actionMayHaveOccurred}).catch(()=>{});
      await removeRun(tabId,thread.runId).catch(()=>{});
      try{const browser=new ChromeBrowser(tabId);await browser.initialize();await browser.endVisual();}catch{}
      await change(tabId,{status:'error',runId:null,approval:null,error,message:{role:'error',text:error,at:Date.now()}});
      return getThread(storage,tabId);
    }
    return thread;
  }
  async function tabClosed(tabId){await stop(tabId);}
  return {start,approve,stop,query,tabClosed,isActive:tabId=>running.has(tabId)};
}
