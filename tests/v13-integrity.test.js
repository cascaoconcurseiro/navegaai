import test from 'node:test';
import assert from 'node:assert/strict';
import {ProofLedger} from '../src/proof-engine.js';
import {inspectInterruptedRun} from '../src/interrupted-run.js';
import {runAgent,traceOutcome} from '../src/agent.js';
import {chromeTools} from '../src/chrome-browser.js';
import {diagnoseRun} from '../src/recovery.js';
const settings={provider:'custom',model:'mock',baseURL:'http://localhost:1234/v1',apiKey:'',streamResponses:false,maxSteps:7,approvalMode:'skip'};
const tc=(id,name,args={})=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
async function scenario(replies,{failClick=false}={}){
  const oldFetch=globalThis.fetch;let k=0;const events=[];
  globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:replies[Math.min(k++,replies.length-1)]}]})});
  const browser={getOrigin:async()=> 'https://example.com',preview:async(name,args)=>({ref:args.ref,label:args.expectedLabel,tag:name==='fill_element'?'input':'button',visible:true,x:15,y:15}),
    execute:async(name)=>{
      if(name==='click_element'&&failClick)throw Error('Sem resposta do Chrome depois de enviar clique');
      if(name==='verify_page')return {ok:true,verified:true,evidence:'changed_state',actionToken:browser.lastActionToken};
      if(name==='get_page')return {ok:true,url:'https://example.com/',title:'Teste',text:'estado',elements:[]};
      browser.lastActionToken=crypto.randomUUID();return {ok:true,actionToken:browser.lastActionToken};
    }};
  try{return {result:await runAgent({userMessage:'Clique e preencha',history:[],settings,adapter:browser,tools:chromeTools,signal:new AbortController().signal,onEvent:e=>events.push(e),requestApproval:async()=>true}),events};}
  finally{globalThis.fetch=oldFetch;}
}
test('não aceita uma prova genérica para duas ações distintas',()=>{
 const ledger=new ProofLedger();
 ledger.dispatched({stepId:'1.1',name:'click_element',actionToken:'token1'});
 ledger.dispatched({stepId:'2.1',name:'fill_element',actionToken:'token2'});
 assert.equal(ledger.evaluate({verified:true,evidence:'changed_state',actionToken:'token2'},'3.1').accepted,true);
 assert.deepEqual(ledger.summary().unverifiedSteps,['1.1']);
 assert.equal(ledger.summary().proofCount,1);
});
test('texto já existente ou estado atual sem mudança não prova ação nova',()=>{
 const ledger=new ProofLedger();ledger.dispatched({stepId:'1.1',name:'click_element',actionToken:'token1'});
 assert.equal(ledger.evaluate({verified:true,evidence:'current_state',actionToken:'token1'},'2.1').accepted,false);
 assert.equal(ledger.evaluate({verified:true,evidence:'already_present'},'2.2').accepted,false);
 assert.equal(ledger.summary().unverifiedCount,1);
 assert.equal(ledger.summary().weakEvidenceCount,2);
});
test('verificação antes de ação não cria crédito transferível',()=>{
 const ledger=new ProofLedger();
 assert.equal(ledger.evaluate({verified:true,evidence:'changed_state'},'1.1').accepted,false);
 ledger.dispatched({stepId:'2.1',name:'click_element'});
 assert.equal(ledger.summary().unverifiedCount,1);
});
test('runAgent não conclui duas mutações com apenas uma confirmação',async()=>{
 const {result}=await scenario([
 {tool_calls:[tc('a','click_element',{ref:'e1',expectedLabel:'Abrir'})]},
 {tool_calls:[tc('b','fill_element',{ref:'e2',expectedLabel:'Assunto',text:'Teste'})]},
 {tool_calls:[tc('c','verify_page',{containsText:'Teste'})]},
 {content:'Tudo concluído.'}]);
 assert.equal(result.metrics.actionCount,2);
 assert.equal(result.metrics.proofCount,1);
 assert.equal(result.metrics.unverifiedCount,1);
 assert.equal(result.metrics.pendingVerification,true);
 assert.match(result.answer,/Resultado não confirmado/);
 assert.equal(diagnoseRun(result.metrics).state,'needs_review');
});
test('falha depois de despachar clique é registrada como indeterminada',async()=>{
 const {result,events}=await scenario([
 {tool_calls:[tc('a','click_element',{ref:'e1',expectedLabel:'Abrir'})]},
 {content:'Finalizado.'}],{failClick:true});
 assert.equal(result.metrics.indeterminateDispatches,1);
 assert.equal(result.metrics.unfulfilledAction,false);
 assert.ok(events.some(e=>e.type==='indeterminate_action'));
 assert.match(result.answer,/pode ter sido aplicado|se o site a aplicou/i);
 assert.doesNotMatch(result.answer,/Nenhuma ação de navegador foi realizada/);
});
test('rastreamento não apresenta verificação fraca como prova',()=>{
 const x=traceOutcome('verify_page',{ok:true,verified:true,evidence:'current_state',proofAccepted:false});
 assert.equal(x.proofVerified,false);
 assert.equal(x.status,'evidência insuficiente');
});
test('reinicialização identifica ação enviada sem resultado e jamais a repete',()=>{
 const journal=[
 {event:'agent_tool_start',runId:'r1',stepId:'1.1',name:'get_page'},
 {event:'agent_tool_success',runId:'r1',stepId:'1.1',name:'get_page'},
 {event:'agent_tool_start',runId:'r1',stepId:'2.1',name:'click_element'},
 {event:'agent_tool_start',runId:'another',stepId:'2.1',name:'click_element'}
 ];
 const inspection=inspectInterruptedRun(journal,'r1');
 assert.deepEqual(inspection.indeterminate,[{stepId:'2.1',name:'click_element'}]);
 assert.equal(inspection.actionMayHaveOccurred,true);
 assert.equal(inspection.finished,false);
});
test('leitura pendente após queda não é classificada como escrita',()=>{
 const x=inspectInterruptedRun([{event:'agent_tool_start',runId:'r2',stepId:'1.1',name:'get_page'}],'r2');
 assert.equal(x.actionMayHaveOccurred,false);
});

test('navegação entre documentos pode confirmar mudança de URL sem liberar confirmação de envio',async()=>{
 const {ChromeBrowser}=await import('../src/chrome-browser.js');
 const old=globalThis.chrome;
 const browser=new ChromeBrowser(80);
 browser.lastNavigation={from:'https://example.com/home',to:'https://mail.google.com/mail/u/0/#inbox',at:Date.now()};
 browser.inject=async()=>({ok:true,verified:true,evidence:'current_state'});
 globalThis.chrome={tabs:{get:async()=>({url:'https://mail.google.com/mail/u/0/#inbox'})}};
 try{
  const status=await browser.execute('verify_page',{urlIncludes:'#inbox'});
  assert.equal(status.evidence,'changed_state');assert.equal(status.navigationProof,true);
  const other=await browser.execute('verify_page',{containsText:'Mensagem enviada'});
  assert.equal(other.evidence,'current_state'); // Sem prova causal do envio.
 }finally{globalThis.chrome=old;}
});

test('URL que não mudou não vira prova causal',async()=>{
 const {ChromeBrowser}=await import('../src/chrome-browser.js');
 const old=globalThis.chrome;
 const browser=new ChromeBrowser(80);
 browser.lastNavigation={from:'https://mail.google.com/mail/u/0/#inbox',to:'https://mail.google.com/mail/u/0/#inbox',at:Date.now()};
 browser.inject=async()=>({ok:true,verified:true,evidence:'current_state'});
 globalThis.chrome={tabs:{get:async()=>({url:'https://mail.google.com/mail/u/0/#inbox'})}};
 try{const result=await browser.execute('verify_page',{urlIncludes:'#inbox'});assert.equal(result.evidence,'current_state');}
 finally{globalThis.chrome=old;}
});

test('agente pode corrigir uma verificação fraca com prova forte da mesma ação',()=>{
 const ledger=new ProofLedger();ledger.dispatched({stepId:'1.1',name:'click_element',actionToken:'token1'});
 assert.equal(ledger.evaluate({verified:true,evidence:'current_state',actionToken:'token1'},'2.1').accepted,false);
 assert.equal(ledger.summary().unresolvedWeakEvidenceCount,1);
 assert.equal(ledger.evaluate({verified:true,evidence:'changed_state',actionToken:'token1'},'3.1').accepted,true);
 assert.equal(ledger.summary().unresolvedWeakEvidenceCount,0);
 assert.equal(ledger.summary().unverifiedCount,0);
});
