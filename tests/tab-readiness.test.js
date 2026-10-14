import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareConversationTab,isWebTabUrl,isEmptyNewTabUrl} from '../src/tab-readiness.js';
import {createExecutionEngine} from '../src/execution-engine.js';

function makeBrowser(tab={id:41,url:'about:blank',status:'complete'},onUpdate){
  const state={...tab};const updates=[];let reads=0;
  return {
    state,updates,
    tabs:{
      get:async id=>{assert.equal(id,state.id);reads++;return {...state};},
      update:async(id,details)=>{assert.equal(id,state.id);updates.push(details);state.url=details.url;state.pendingUrl=undefined;state.status='complete';onUpdate?.(state,details);return {...state};}
    },
    get reads(){return reads;}
  };
}
const options={intervalMs:10,timeoutMs:250};

test('Aceita endereço HTTP(S) já pronto sem navegação adicional',async()=>{
  const browser=makeBrowser({id:41,url:'https://mail.google.com/mail/',status:'complete'});
  const result=await prepareConversationTab(browser,41,options);
  assert.equal(result.bootstrapped,false);
  assert.equal(result.tab.url,'https://mail.google.com/mail/');
  assert.equal(browser.updates.length,0);
});

test('Nova conversa vazia prepara a MESMA aba, sem criar outras',async()=>{
  for(const blank of ['about:blank','chrome://newtab/','about:newtab','']){
    const browser=makeBrowser({id:41,url:blank,status:'complete'});
    const result=await prepareConversationTab(browser,41,options);
    assert.equal(result.tab.id,41);
    assert.equal(result.tab.url,'https://www.google.com/');
    assert.equal(result.bootstrapped,true);
    assert.equal(browser.updates.length,1);
  }
});

test('Espera pendingUrl em vez de sobrescrever navegação que começou',async()=>{
  const browser=makeBrowser({id:41,url:'about:blank',pendingUrl:'https://mail.google.com/',status:'loading'});
  const get=browser.tabs.get;
  let reads=0;
  browser.tabs.get=async id=>{const result=await get(id);if(++reads===3){browser.state.url='https://mail.google.com/';browser.state.pendingUrl=undefined;browser.state.status='complete';}return reads>=3?{...browser.state}:result;};
  const result=await prepareConversationTab(browser,41,options);
  assert.equal(result.bootstrapped,false);
  assert.equal(result.tab.url,'https://mail.google.com/');
  assert.equal(browser.updates.length,0);
});

test('Espera a página ficar pronta, mesmo que a URL já esteja disponível',async()=>{
  const browser=makeBrowser({id:41,url:'https://example.org/',status:'loading'});
  const get=browser.tabs.get;let reads=0;
  browser.tabs.get=async id=>{const result=await get(id);if(++reads===3){browser.state.status='complete';return {...browser.state};}return result;};
  const result=await prepareConversationTab(browser,41,options);
  assert.equal(result.tab.status,'complete');assert.ok(reads>=3);
});

test('Não fecha nem redireciona páginas internas ou arquivos locais',async()=>{
  for(const url of ['chrome://extensions/','chrome://settings/','chrome-extension://abc/panel.html','file:///documento.html','edge://settings/']){
    const browser=makeBrowser({id:41,url,status:'complete'});
    await assert.rejects(prepareConversationTab(browser,41,options),/página protegida/);
    assert.equal(browser.updates.length,0);
  }
});

test('Não substitui navegação pendente para página protegida',async()=>{
  const browser=makeBrowser({id:41,url:'about:blank',pendingUrl:'chrome://settings/',status:'loading'});
  await assert.rejects(prepareConversationTab(browser,41,options),/página protegida/);
  assert.equal(browser.updates.length,0);
});

test('Abas fechadas recebem mensagem acionável, sem recriar a aba',async()=>{
  const browser={tabs:{get:async()=>{throw Error('No tab with id');},update:async()=>{throw Error('No tab');}}};
  await assert.rejects(prepareConversationTab(browser,41,options),/Reabra a conversa/);
});

test('Protocolo web não aceita userinfo, javascript: ou extensões',()=>{
  assert.equal(isWebTabUrl('https://user:secret@example.com'),false);
  assert.equal(isWebTabUrl('javascript:alert(1)'),false);
  assert.equal(isWebTabUrl('chrome://newtab/'),false);
  assert.equal(isEmptyNewTabUrl('chrome://settings/'),false);
});

function makeStore(){const values={};return {
  async get(key){return Object.fromEntries((Array.isArray(key)?key:[key]).map(k=>[k,values[k]]));},
  async set(data){Object.assign(values,data);},async remove(k){delete values[k];}
};}
async function until(done){for(let i=0;i<70;i++){const r=await done();if(r)return r;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Tempo de teste excedido');}

test('Motor inicia em nova aba vazia SEM forçar Google e registra modo navegação, sem alterar outra conversa',async()=>{
  const prior=globalThis.chrome;
  const store=makeStore(),session=makeStore();await store.set({settings:{provider:'demo',approvalMode:'auto',maxSteps:3}});
  const tabData=new Map([[41,{id:41,url:'about:blank',status:'complete'}],[42,{id:42,url:'https://example.org/',status:'complete'}]]);
  const updates=[];const events=[];
  const chrome={storage:{session},runtime:{getManifest:()=>({permissions:[]})},tabs:{
    get:async id=>({...tabData.get(id)}),update:async(id,changes)=>{updates.push({id,...changes});Object.assign(tabData.get(id),changes);return {...tabData.get(id)};}
  },scripting:{insertCSS:async()=>{},executeScript:async()=>[{result:{ok:true,title:'Página aberta',text:'Conteúdo',elements:[]}}]}};
  globalThis.chrome=chrome;
  const engine=createExecutionEngine({chrome,storage:store,log:async x=>events.push(x),getSites:async()=>({}),setSite:async()=>{},updateRun:async()=>{},removeRun:async()=>{}});
  try{
    const started=await engine.start({tabId:41,userMessage:'Resuma esta página'});
    assert.ok(started.runId);
    const finished=await until(async()=>{const t=await engine.query(41);return t.status==='completed'?t:null;});
    assert.equal(finished.messages[0].text,'Resuma esta página');
    assert.equal(updates.length,0); // Nenhuma navegação implícita fora do pedido do usuário
    assert.equal(tabData.get(42).url,'https://example.org/');
    assert.ok(events.some(x=>x.event==='conversation_navigation_ready'&&x.tabId===41));
  }finally{globalThis.chrome=prior;}
});

test('Pré-checagem malsucedida registra pedido e causa nos logs da conversa',async()=>{
  const store=makeStore(),session=makeStore();const errors=[];
  const chrome={storage:{session},tabs:{get:async id=>({id,url:'chrome://settings/',status:'complete'})}};
  const engine=createExecutionEngine({chrome,storage:store,log:async x=>errors.push(x),getSites:async()=>({}),setSite:async()=>{},updateRun:async()=>{},removeRun:async()=>{}});
  await assert.rejects(engine.start({tabId:41,userMessage:'Abra o Gmail'}),/página protegida/);
  const thread=await engine.query(41);
  assert.equal(thread.status,'error');
  assert.equal(thread.messages[0].text,'Abra o Gmail');
  assert.equal(thread.messages[1].role,'error');
  assert.ok(errors.some(x=>x.event==='run_preflight_failed'));
});

test('Quando há página anterior e pendingUrl diferente, espera a nova origem',async()=>{
  const browser=makeBrowser({id:41,url:'https://aliexpress.com/',pendingUrl:'https://mail.google.com/',status:'loading'});
  const get=browser.tabs.get;let reads=0;
  browser.tabs.get=async id=>{let tab=await get(id);if(++reads===3){browser.state.url=browser.state.pendingUrl;browser.state.pendingUrl=undefined;browser.state.status='complete';tab={...browser.state};}return tab;};
  const result=await prepareConversationTab(browser,41,options);
  assert.equal(result.tab.url,'https://mail.google.com/');
  assert.equal(result.bootstrapped,false);
  assert.equal(browser.updates.length,0);
});

test('Uma aba nova pode esperar comando de navegação sem homepage externo',async()=>{
 for(const blank of ['about:blank','chrome://newtab/','about:newtab','']){
  const browser=makeBrowser({id:41,url:blank,status:'complete'});
  const ready=await prepareConversationTab(browser,41,{...options,allowBlankNavigation:true});
  assert.equal(ready.navigationOnly,true);
  assert.equal(ready.tab.url,blank);
  assert.equal(browser.updates.length,0);
 }
});

test('Opção de navegação não contorna páginas Chrome protegidas',async()=>{
 const browser=makeBrowser({id:41,url:'chrome://settings/',status:'complete'});
 await assert.rejects(prepareConversationTab(browser,41,{...options,allowBlankNavigation:true}),/página protegida/);
 assert.equal(browser.updates.length,0);
});
