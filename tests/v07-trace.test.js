import test from 'node:test';
import assert from 'node:assert/strict';
import {pageOperation,chromeTools} from '../src/chrome-browser.js';
import {runAgent,traceArgs,traceOutcome} from '../src/agent.js';
import {normalizeSettings} from '../src/providers.js';
import {redact} from '../src/audit.js';

const testSettings={provider:'custom',model:'mock',baseURL:'http://localhost:1234/v1',approvalMode:'skip',maxSteps:5,apiKey:''};
const call=(name,args={})=>({id:crypto.randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}});
const fakeFetch=(replies)=>{let k=0;return async()=>({ok:true,json:async()=>({choices:[{message:replies[Math.min(k++,replies.length-1)]}],usage:{total_tokens:8}})});};

test('Ferramenta verify_page confirma o estado real sem expor texto completo',()=>{
 const oldDoc=globalThis.document,oldLoc=globalThis.location;
 globalThis.document={title:'Mensagem enviada',body:{innerText:'Sua mensagem foi enviada com sucesso'}};
 globalThis.location={href:'https://mail.google.com/mail/u/0/#sent'};
 try{
  const yes=pageOperation('verify',{containsText:'mensagem foi enviada',urlIncludes:'#sent'});
  assert.equal(yes.verified,true);
  assert.deepEqual(yes.checks.map(c=>c.matched),[true,true]);
  const no=pageOperation('verify',{containsText:'Pagamento concluído'});
  assert.equal(no.verified,false);
  assert.throws(()=>pageOperation('verify',{}),/critério válido/);
 }finally{globalThis.document=oldDoc;globalThis.location=oldLoc;}
});

test('Logs de ferramenta guardam o alvo e a URL sem dados digitados, query strings ou secrets',()=>{
 const args=traceArgs('fill_element',{ref:'e12',text:'minha senha secreta 12345'});
 assert.equal(args.ref,'e12');assert.equal(args.text.includes('12345'),false);
 const nav=traceArgs('navigate_tab',{url:'https://example.com/path?token=SECRET#frag'});
 assert.equal(nav.destination,'https://example.com/path');
 assert.equal(redact({secret:'abcdef',operation:args}).secret,'[redigido]');
 assert.equal(traceOutcome('verify_page',{ok:true,verified:true}).proofVerified,true);
});

test('Modo avançado de mensagens não é habilitado sem opção explícita',()=>{
 assert.equal(normalizeSettings({}).showTechnicalEvents,false);
 assert.equal(normalizeSettings({showTechnicalEvents:true}).showTechnicalEvents,true);
 assert.equal(normalizeSettings({showTechnicalEvents:'true'}).showTechnicalEvents,false);
 assert.ok(chromeTools.some(x=>x.function.name==='verify_page'));
});

test('Operação com prova de resultado independente é contabilizada',async()=>{
 const old=globalThis.fetch, events=[];
 globalThis.fetch=fakeFetch([
  {tool_calls:[call('click_element',{ref:'e3'})]},
  {tool_calls:[call('verify_page',{containsText:'Foi salvo'})]},
  {content:'Foi salvo e verificado.'}]);
 const adapter={preview:async()=>({ref:'e3',label:'Salvar',tag:'button',disabled:false,sensitive:false}),getOrigin:async()=> 'https://example.com',
 execute:async name=>name==='click_element'?{ok:true,ref:'e3',actionToken:'test-save'}:name==='verify_page'?{ok:true,verified:true,evidence:'changed_state',actionToken:'test-save'}:{title:'Form',text:'Foi salvo',elements:[]}};
 try{
  const result=await runAgent({userMessage:'Salvar',history:[],settings:testSettings,adapter,tools:chromeTools,signal:new AbortController().signal,
   onEvent:e=>events.push(e),requestApproval:async()=>true});
  assert.equal(result.metrics.toolFailures,0);assert.equal(result.metrics.mutations,1);assert.equal(result.metrics.verifiedProofs,1);
  assert.equal(events.some(x=>x.type==='model_done'&&x.ms>=0),true);
  assert.equal(events.some(x=>x.type==='tool_success'&&x.name==='verify_page'&&x.result.proofVerified),true);
 }finally{globalThis.fetch=old;}
});

test('Resposta silenciosa ok=false é uma falha, não sucesso de ferramenta',async()=>{
 const old=globalThis.fetch,events=[];
 globalThis.fetch=fakeFetch([{tool_calls:[call('click_element',{ref:'e1'})]},{content:'Feito.'}]);
 const adapter={preview:async()=>({ref:'e1',label:'Salvar',tag:'button'}),getOrigin:async()=> 'https://example.com',
 execute:async()=>({ok:false,error:'Botão não reagiu'})};
 try{
  const r=await runAgent({userMessage:'Salvar',history:[],settings:testSettings,adapter,tools:chromeTools,signal:new AbortController().signal,
  onEvent:e=>events.push(e),requestApproval:async()=>true});
  assert.equal(r.metrics.toolFailures,1);
  assert.ok(events.some(e=>e.type==='tool_error'&&e.error.includes('Botão não reagiu')));
  assert.ok(!events.some(e=>e.type==='tool_success'));
 }finally{globalThis.fetch=old;}
});
