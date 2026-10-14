import test from 'node:test';
import assert from 'node:assert/strict';
import {createRuntimeController} from '../src/runtime-client.js';

function setup(){
  const job='1'.repeat(32), request='2'.repeat(32),tabId=51;
  const data=new Map([
    ['navegaThreadV1:'+tabId,{tabId,backend:'runtime',runtimeJobId:job,
      approval:{kind:'action',runId:job,requestId:request,label:'Continuar'},messages:[],status:'approval'}],
    ['settings',{runtimeUrl:'http://127.0.0.1:8765/'}],
    ['navegaConversationIndexV1',{tabs:{},conversations:{}}],
  ]);
  const storage={get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,data.get(k)])),
    set:async patch=>{Object.entries(patch).forEach(([k,v])=>data.set(k,v));}};
  const chrome={storage:{session:{get:async()=>({runtimeToken:'k'.repeat(32)})}}};
  return {controller:createRuntimeController({storage,chrome,log:async()=>{}}),data,job,request,tabId};
}
test('runtime action approval maps UI yes to approved and is scoped to run',async()=>{
  const {controller,job,request,tabId,data}=setup();
  const original=globalThis.fetch;let sent;
  globalThis.fetch=async(url,options)=>{sent={url,body:JSON.parse(options.body)};return {ok:true,json:async()=>({ok:true})};};
  try{
    await assert.rejects(controller.approve({tabId,runId:job,requestId:'wrong',decision:'yes'}),/não corresponde/);
    await controller.approve({tabId,runId:job,requestId:request,decision:'yes'});
    assert.equal(sent.url,`http://127.0.0.1:8765/tasks/${job}/decision`);
    assert.equal(sent.body.decision,'approve');
    assert.equal(data.get('navegaThreadV1:'+tabId).approval,null);
  }finally{globalThis.fetch=original;}
});
test('runtime explicit denial maps to reject',async()=>{
  const {controller,job,request,tabId}=setup();
  const original=globalThis.fetch;let body;
  globalThis.fetch=async(_,options)=>{body=JSON.parse(options.body);return {ok:true,json:async()=>({ok:true})};};
  try{
    await controller.approve({tabId,runId:job,requestId:request,decision:'deny'});
    assert.equal(body.decision,'reject');
  }finally{globalThis.fetch=original;}
});
