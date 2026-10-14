import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForCommittedNavigation} from '../src/navigation-commit.js';

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

test('Página interna de erro de rede é reportada sem confirmação falsa',async()=>{
 const api=ticks([{url:'https://example.com/',status:'loading'}, {url:'chrome-error://chromewebdata/',status:'complete'}]);
 await assert.rejects(waitForCommittedNavigation(api,42,opts),/NAVEGACAO_BLOQUEADA/);
});
