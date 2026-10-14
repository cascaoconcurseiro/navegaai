import test from 'node:test';import assert from 'node:assert/strict';
import {createExecutionEngine} from '../src/execution-engine.js';
const storage=()=>{let d={};return {get:async k=>Array.isArray(k)?Object.fromEntries(k.map(x=>[x,d[x]])):{[k]:d[k]},set:async values=>{d={...d,...values}},remove:async k=>{delete d[k]}};};
const until=async predicate=>{for(let i=0;i<110;i++){const v=await predicate();if(v)return v;await new Promise(r=>setTimeout(r,15));}throw Error('Expirou');};
const tool=(id,name,args)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
function makeHarness(mode){
 const local=storage(),session=storage();
 const tabs=new Map([[51,{id:51,url:'https://aliexpress.com/item/1',status:'complete',title:'Pedido'}]]);
 const chrome={storage:{session},runtime:{getManifest:()=>({permissions:[]})},tabs:{get:async id=>({...tabs.get(id)}),query:async()=>[tabs.get(51)],update:async(id,v)=>{Object.assign(tabs.get(id),v);return tabs.get(id);}},
 scripting:{insertCSS:async()=>{},executeScript:async ({args:[kind,details]})=>{
  if(kind==='snapshot')return [{result:{title:'Teste',url:tabs.get(51).url,text:tabs.get(51).url.includes('google')?'Gmail · Caixa de entrada · Escrever · Enviar':'AliExpress',elements:['e1 button Enviar']}}];
  if(kind==='preview')return [{result:{ref:details.ref,tag:'button',label:'Enviar e-mail',x:65,y:35,visible:true,sensitive:false,opensNewTab:false,disabled:false}}];
  return [{result:{ok:true,kind}}];
 }}};
 return {chrome,local,tabs,session,mode};
}
for(const mode of ['auto','skip'])test(`fluxo AliExpress → Gmail no modo ${mode} sem bloqueio entre domínios`,async()=>{
 const h=makeHarness(mode);const origChrome=globalThis.chrome,origFetch=globalThis.fetch;globalThis.chrome=h.chrome;
 const responses=[
  {tool_calls:[tool('a','get_page',{})]},
  {tool_calls:[tool('b','navigate_tab',{url:'https://mail.google.com/mail/u/0/#inbox'})]},
  {tool_calls:[tool('c','get_page',{})]},
  {tool_calls:[tool('d','click_element',{ref:'e1'})]},
  {content:'Naveguei até o Gmail e acionei Enviar conforme autorizado.'}
 ];let steps=0;
 globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:responses[Math.min(steps++,responses.length-1)]}]})});
 await h.local.set({settings:{provider:'custom',model:'mock',baseURL:'http://localhost:1234/v1',approvalMode:mode,maxSteps:8}});
 const logs=[],permissions={};
 const engine=createExecutionEngine({chrome:h.chrome,storage:h.local,log:async x=>logs.push(x),getSites:async()=>permissions,setSite:async()=>{},
 updateRun:async()=>{},removeRun:async()=>{}});
 try{
  const {runId}=await engine.start({tabId:51,userMessage:'Abra o Gmail e envie um e-mail de teste'});
  if(mode==='auto'){
   const request=await until(async()=>{const t=await engine.query(51);return t.approval?.kind==='action'?t.approval:null;});
   assert.equal(request.name,'click_element');
   await engine.approve({tabId:51,runId,requestId:request.requestId,decision:'yes'});
  }
  const done=await until(async()=>{const t=await engine.query(51);return ['needs_review','error'].includes(t.status)?t:null;});
  assert.equal(done.status,'needs_review',done.error); // Comando aceito, mas não há prova independente do envio.
  assert.equal(h.tabs.get(51).url,'https://mail.google.com/mail/u/0/#inbox');
  assert.ok(logs.some(x=>x.event==='site_auto_scoped'&&x.origin==='https://mail.google.com'));
  if(mode==='skip')assert.equal(logs.filter(x=>x.event==='approval_requested').length,0);
 }finally{globalThis.chrome=origChrome;globalThis.fetch=origFetch;}
});
