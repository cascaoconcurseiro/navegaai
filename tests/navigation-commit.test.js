import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForCommittedNavigation} from '../src/navigation-commit.js';
import {ChromeBrowser} from '../src/chrome-browser.js';

function ticks(states){
 let calls=0;return {tabs:{get:async()=>({...states[Math.min(calls++,states.length-1)]})},get calls(){return calls}};
}
const opts={timeoutMs:100,intervalMs:2,requestedUrl:'https://mail.google.com/mail/u/0/',beforeUrl:'https://example.com/'};

test('Navegação não aceita status complete obsoleto antes do carregamento',async()=>{
 const api=ticks([
  {url:'https://example.com/',status:'complete'},
  {url:'https://example.com/',pendingUrl:opts.requestedUrl,status:'loading'},
  {url:opts.requestedUrl,status:'loading'},
  {url:opts.requestedUrl,status:'complete'}
 ]);
 const tab=await waitForCommittedNavigation(api,42,opts);
 assert.equal(tab.url,opts.requestedUrl);assert.ok(api.calls>=4);
});

test('Navegação confirma redirecionamento de login somente após commit',async()=>{
 const api=ticks([
  {url:'https://example.com/',status:'complete'},
  {url:'https://accounts.google.com/signin',status:'loading'},
  {url:'https://accounts.google.com/signin',status:'complete'}
 ]);
 const tab=await waitForCommittedNavigation(api,42,opts);
 assert.equal(tab.url,'https://accounts.google.com/signin');
});

test('Timeout não inventa sucesso se Chrome continua mostrando página antiga',async()=>{
 const api=ticks([{url:'https://example.com/',status:'complete'}]);
 await assert.rejects(waitForCommittedNavigation(api,42,{...opts,timeoutMs:35}),/NAVEGACAO_SEM_CONFIRMACAO/);
});

test('Navegação interrompida reporta efeito indeterminado, sem retry',async()=>{
 const api=ticks([{url:'https://example.com/',status:'loading'}]);
 const controller=new AbortController();controller.abort();
 await assert.rejects(waitForCommittedNavigation(api,42,{...opts,signal:controller.signal}),/NAVEGACAO_INTERROMPIDA/);
});

test('ChromeBrowser lê estado de navegação em aba nova sem injeção em Chrome interno',async()=>{
 const saved=globalThis.chrome;
 const calls=[];const state={id:49,url:'about:blank',status:'complete'};
 globalThis.chrome={tabs:{get:async()=>({...state}),update:async(id,values)=>{calls.push(values);state.url=values.url;return {...state}}},scripting:{insertCSS:async()=>{throw Error('Não deveria injetar sem página web.');}}};
 try {
  const browser=new ChromeBrowser(49,{authorizeOrigin:async o=>o==='https://mail.google.com'});
  await browser.initialize();assert.equal(browser.origin,null);
  const snapshot=await browser.execute('get_page',{});
  assert.equal(snapshot.navigationOnly,true);assert.deepEqual(snapshot.elements,[]);
  await assert.rejects(browser.execute('click_element',{ref:'e1',expectedLabel:'Enviar'}),/ainda não tem documento web/);
  const opened=await browser.execute('navigate_tab',{url:'https://mail.google.com/'});
  assert.equal(opened.url,'https://mail.google.com/');
  assert.equal(browser.origin,'https://mail.google.com');
  assert.equal(calls.length,1);
 }finally{globalThis.chrome=saved;}
});

test('ChromeBrowser bloqueia redirecionamento a origem não autorizada e não lê seu DOM',async()=>{
 const saved=globalThis.chrome;const state={id:22,url:'https://example.com/',status:'complete'};
 let injected=0;
 globalThis.chrome={tabs:{get:async()=>({...state}),update:async(id,values)=>{state.url='https://evil.example/';return {...state}}},scripting:{executeScript:async()=>{injected++;return[{result:{ok:true}}]}}};
 try{
  const b=new ChromeBrowser(22,{authorizeOrigin:async origin=>origin==='https://mail.google.com'});
  await b.initialize();
  await assert.rejects(b.execute('navigate_tab',{url:'https://mail.google.com/'}),/não autorizado/);
  assert.equal(injected,0);
  await assert.rejects(b.execute('get_page',{}),/sem autorização/);
 }finally{globalThis.chrome=saved;}
});

test('Página interna de erro de rede é reportada sem confirmação falsa',async()=>{
 const api=ticks([{url:'https://example.com/',status:'loading'}, {url:'chrome-error://chromewebdata/',status:'complete'}]);
 await assert.rejects(waitForCommittedNavigation(api,42,opts),/NAVEGACAO_BLOQUEADA/);
});

test('Redirect de login é autorizado separadamente antes da leitura do site',async()=>{
 const prev=globalThis.chrome;const state={id:33,url:'https://example.com/',status:'complete'};
 const approvals=[];
 globalThis.chrome={tabs:{get:async()=>({...state}),update:async()=>{state.url='https://accounts.google.com/signin';return {...state}}},scripting:{insertCSS:async()=>{},executeScript:async()=>[{result:{title:'Login',url:state.url,text:'Login',elements:[]}}]}};
 try{
  const b=new ChromeBrowser(33,{authorizeOrigin:async(origin,meta)=>{approvals.push({origin,meta});return origin==='https://mail.google.com'||origin==='https://accounts.google.com';}});
  await b.initialize();
  const result=await b.execute('navigate_tab',{url:'https://mail.google.com/'});
  assert.equal(result.url,'https://accounts.google.com/signin');
  assert.deepEqual(approvals.map(x=>x.origin),['https://mail.google.com','https://accounts.google.com']);
  assert.equal(approvals[1].meta.redirected,true);
  assert.equal((await b.getOrigin()),'https://accounts.google.com');
 }finally{globalThis.chrome=prev;}
});
