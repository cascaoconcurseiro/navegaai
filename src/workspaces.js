// Each Chrome tab owns one conversation; independent keys avoid lost writes across tabs.
export const THREAD_PREFIX='navegaThreadV1:';
const MAX_MESSAGES=180;
export function threadKey(tabId){
  if(!Number.isInteger(tabId)||tabId<1)throw Error('Aba inválida para conversa.');
  return THREAD_PREFIX+tabId;
}
export async function getThread(storage,tabId){
  const data=(await storage.get(threadKey(tabId)))[threadKey(tabId)];
  return data||{tabId,threadId:'tab-'+tabId,messages:[],history:[],status:'idle',runId:null,approval:null,updatedAt:null};
}
export function sanitizeThreadEvent(event){
  if(!event||typeof event!=='object')throw Error('Evento inválido.');
  const {type,name,risk,reason,decision,step,stepId,actionStepId,ms,ok,text,error,args,result}=event;
  const t=String(type||'').slice(0,36);
  if(!t)throw Error('Evento sem tipo.');
  return {type:t,name:String(name||'').slice(0,60),risk:String(risk||'').slice(0,30),
    reason:String(reason||'').slice(0,280),decision:String(decision||'').slice(0,50),
    step:Number.isInteger(step)?step:undefined,stepId:String(stepId||'').slice(0,20),actionStepId:String(actionStepId||'').slice(0,20),args:args&&typeof args==='object'?args:undefined,result:result&&typeof result==='object'?result:undefined,ms:Number.isFinite(ms)?ms:undefined,
    ok:ok===true,text:String(text||'').slice(0,6000),error:String(error||'').slice(0,500),at:Date.now()};
}
export function reduceThread(thread,change){
  const next={...thread,version:(thread.version||0)+1,updatedAt:new Date().toISOString()};
  if(change.message){next.messages=[...thread.messages,change.message].slice(-MAX_MESSAGES);}
  if(change.event){next.messages=[...thread.messages,{role:'event',event:sanitizeThreadEvent(change.event)}].slice(-MAX_MESSAGES);}
  if(change.status)next.status=change.status;
  if('runId' in change)next.runId=change.runId;
  if('approval' in change)next.approval=change.approval;
  if(change.history)next.history=change.history.slice(-12);
  if(['chrome','runtime'].includes(change.backend))next.backend=change.backend;
  if('runtimeJobId' in change)next.runtimeJobId=change.runtimeJobId;
  if('runtimeFinalized' in change)next.runtimeFinalized=!!change.runtimeFinalized;
  if('runtimeSeq' in change)next.runtimeSeq=Math.max(0,Number(change.runtimeSeq)||0);
  if('error' in change)next.error=String(change.error||'').slice(0,500);
  if('draft' in change)next.draft=String(change.draft||'').slice(0,9000);
  return next;
}
