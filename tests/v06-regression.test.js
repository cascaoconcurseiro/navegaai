import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldApprove,classifyAction} from '../src/policies.js';
import {ChromeBrowser} from '../src/chrome-browser.js';
import {createExecutionEngine} from '../src/execution-engine.js';
import {getThread} from '../src/workspaces.js';
import {normalizeSettings} from '../src/providers.js';

function makeStore(){const values={};return {values,
 async get(key){if(Array.isArray(key))return Object.fromEntries(key.map(k=>[k,values[k]]));return {[key]:values[key]};},
 async set(data){Object.assign(values,data);},async remove(key){delete values[key];}};}
function mockChrome(){
 const data=new Map([[11,{id:11,url:'https://aliexpress.com/pedido',title:'Pedido',status:'complete'}],[12,{id:12,url:'https://example.com',title:'Demo',status:'complete'}]]);
 const session=makeStore();
 const fake={storage:{session},runtime:{getManifest:()=>({permissions:['debugger']})},
  tabs:{get:async id=>{if(!data.has(id))throw Error('Tab closed');return {...data.get(id)};},
   update:async(id,{url})=>{data.get(id).url=url;return {...data.get(id)};},
   query:async()=>[{...data.get(11)}]},
  scripting:{insertCSS:async()=>{},executeScript:async()=>[{result:{title:'Página de teste',text:'Primeiro teste. Segundo teste.',url:'https://example.com',elements:[]}}]},
  debugger:{attach:async()=>{},sendCommand:async()=>{},detach:async()=>{}}};
 return fake;
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f,max=60){for(let i=0;i<max;i++){const x=await f();if(x)return x;await pause(15);}throw Error('Timeout de teste');}

test('Manual, Automático, Livre e Somente leitura possuem semânticas distintas',()=>{
 const medium=classifyAction('navigate_tab',{url:'https://mail.google.com/'},null,'https://aliexpress.com');
 const high=classifyAction('click_element',{}, {label:'Enviar e-mail',tag:'button'},'https://mail.google.com');
 assert.equal(medium.kind,'medium');assert.equal(high.kind,'high');
 assert.equal(shouldApprove('review',medium),true);
 assert.equal(shouldApprove('auto',medium),false);
 assert.equal(shouldApprove('auto',high),true);
 assert.equal(shouldApprove('skip',medium),false);
 assert.equal(shouldApprove('skip',high),false);
 assert.equal(shouldApprove('read_only',high),false);
 assert.equal(normalizeSettings({approvalMode:'safe'}).approvalMode,'auto');
 assert.equal(normalizeSettings({approvalMode:'skip'}).approvalMode,'skip');
});

test('Navegação permitida entre sites mantém a MESMA aba e nega destino não autorizado',async()=>{
 const prev=globalThis.chrome;const fake=mockChrome();globalThis.chrome=fake;
 try{
  let requested=[];
  const browser=new ChromeBrowser(11,{authorizeOrigin:async(o)=>{requested.push(o);return o==='https://mail.google.com';}});
  await browser.initialize();
  await browser.execute('navigate_tab',{url:'https://mail.google.com/mail/u/0/#inbox'});
  assert.equal((await fake.tabs.get(11)).url,'https://mail.google.com/mail/u/0/#inbox');
  assert.deepEqual(requested,['https://mail.google.com']);
  assert.equal((await browser.getOrigin()),'https://mail.google.com');
  await assert.rejects(browser.execute('navigate_tab',{url:'https://blocked.test'}),/não autorizado/);
  assert.equal((await fake.tabs.get(11)).url,'https://mail.google.com/mail/u/0/#inbox');
 }finally{globalThis.chrome=prev;}
});

test('Agente em Automático não pede permissão para site desconhecido e persiste conversa',async()=>{
 const prev=globalThis.chrome;const fake=mockChrome();globalThis.chrome=fake;
 const storage=makeStore();await storage.set({settings:{provider:'demo',approvalMode:'auto',maxSteps:4}});
 const logs=[],actives=new Map();
 const engine=createExecutionEngine({chrome:fake,storage,log:async r=>{logs.push(r);},
  getSites:async()=>({}),setSite:async()=>{},
  updateRun:async(tab,run,patch)=>{actives.set(tab,{runId:run,...patch});},
  removeRun:async tab=>{actives.delete(tab);}});
 try{
  const started=await engine.start({tabId:11,userMessage:'Resuma esta página'});
  assert.ok(started.runId);
  const finished=await until(async()=>{const state=await engine.query(11);return state.status==='completed'?state:null;});
  assert.equal(finished.messages[0].role,'user');
  assert.ok(finished.messages.some(x=>x.role==='agent'));
  assert.equal(finished.approval,null);
  assert.ok(logs.some(x=>x.event==='site_auto_scoped'));
  assert.equal((await getThread(storage,12)).messages.length,0);
 }finally{globalThis.chrome=prev;}
});

test('Conversas concorrentes não conflitam e fechamento da aba cancela a tarefa',async()=>{
 const prev=globalThis.chrome;const fake=mockChrome();globalThis.chrome=fake;
 const storage=makeStore();await storage.set({settings:{provider:'demo',approvalMode:'review',maxSteps:3}});
 const engine=createExecutionEngine({chrome:fake,storage,log:async()=>{},getSites:async()=>({}),setSite:async()=>{},
 updateRun:async()=>{},removeRun:async()=>{}});
 try{
  const a=await engine.start({tabId:11,userMessage:'Resuma esta página'});
  const b=await engine.start({tabId:12,userMessage:'Resuma esta página'});
  assert.notEqual(a.runId,b.runId);
  await assert.rejects(engine.start({tabId:11,userMessage:'duplica'}),/já está executando/);
  const reqA=await until(async()=>{const t=await engine.query(11);return t.approval||null;});
  const reqB=await until(async()=>{const t=await engine.query(12);return t.approval||null;});
  assert.equal(reqA.kind,'site');assert.equal(reqB.kind,'site');
  await engine.approve({tabId:11,runId:a.runId,requestId:reqA.requestId,decision:'once'});
  await engine.stop(12);
  await until(async()=>{const t=await engine.query(11);return t.status==='completed';});
  await until(async()=>{const t=await engine.query(12);return t.status==='cancelled';});
  assert.ok((await engine.query(11)).messages.some(x=>x.role==='agent'));
  assert.ok(!(await engine.query(12)).messages.some(x=>x.role==='agent'));
 }finally{globalThis.chrome=prev;}
});

test('Modo Livre ainda proíbe pagamentos e operações irreversíveis',()=>{
 const buy=classifyAction('click_element',{}, {label:'Finalizar compra',tag:'button'},'https://aliexpress.com');
 assert.equal(buy.blocked,true);assert.equal(buy.kind,'forbidden');
 const send=classifyAction('click_element',{}, {label:'Enviar e-mail',tag:'button'},'https://mail.google.com');
 assert.equal(send.blocked,false);assert.equal(shouldApprove('skip',send),false);
});
