import test from 'node:test';
import assert from 'node:assert/strict';
import {findReplacementRef,diagnoseRun,classifyToolFailure} from '../src/recovery.js';
import {runAgent} from '../src/agent.js';
import {chromeTools,pageOperation} from '../src/chrome-browser.js';

const settings={provider:'custom',model:'mock',baseURL:'http://localhost:1234/v1',apiKey:'',streamResponses:false,maxSteps:5,approvalMode:'skip'};
function tc(name,args){return {id:'call_'+Math.random().toString(36).slice(2),type:'function',function:{name,arguments:JSON.stringify(args)}};}
async function mockedRun(responses,adapter){
 const old=globalThis.fetch;let index=0;const events=[];
 globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:responses[Math.min(index++,responses.length-1)]}]})});
 try{return {result:await runAgent({userMessage:'Clique no controle solicitado',settings,history:[],adapter,tools:chromeTools,signal:new AbortController().signal,onEvent:e=>events.push(e),requestApproval:async()=>true}),events};}
 finally{globalThis.fetch=old;}
}

test('Recuperação só usa rótulo exato e alvo único',()=>{
 const snap={elements:['e1 button nome="Enviar"','e2 a nome="Mais opções"','e3 input nome="Para" tipo=text']};
 assert.equal(findReplacementRef(snap,'click_element','ENVIAR')?.ref,'e1');
 assert.equal(findReplacementRef(snap,'fill_element','Para')?.ref,'e3');
 assert.equal(findReplacementRef(snap,'click_element','Envi'),null);
 assert.equal(findReplacementRef({...snap,elements:['e1 button nome="Enviar"','e5 button nome="Enviar"']},'click_element','Enviar'),null);
 assert.equal(findReplacementRef({elements:['e1 input nome="Senha" [campo protegido]']},'fill_element','Senha'),null);
});

test('Repara referência de botão antes do clique, sem repetir ação',async()=>{
 let previews=0, clicks=0;const adapter={
   preview:async(_n,a)=>{previews++;if(a.ref==='e99')throw Error('PREVIEW_INDISPONIVEL: referência antiga');return {ref:a.ref,label:'Abrir',tag:'button',visible:true,x:30,y:25};},
   getOrigin:async()=> 'https://site.example',
   execute:async(name,args)=>name==='get_page'?{title:'Site',url:'https://site.example',text:'teste',elements:['e4 button nome="Abrir"']}:name==='click_element'?(clicks++,{ok:true,action:'click'}):{ok:true}
 };
 const {result,events}=await mockedRun([{tool_calls:[tc('click_element',{ref:'e99',expectedLabel:'Abrir'})]},{content:'Executado.'}],adapter);
 assert.equal(clicks,1);
 assert.equal(result.metrics.recoveryAttempts,1);
 assert.equal(result.metrics.recoveredTargets,1);
 assert.equal(result.metrics.toolFailures,0);
 assert.ok(events.some(e=>e.type==='recovery_success'));
});

test('Autorreparo ambíguo não envia clique',async()=>{
 let clicks=0;const adapter={
   preview:async()=>{throw Error('PREVIEW_INDISPONIVEL');},getOrigin:async()=> 'https://site.example',
   execute:async(name)=>name==='get_page'?{elements:['e2 button nome="Enviar"','e3 button nome="Enviar"']}:name==='click_element'?(clicks++,{ok:true}):{ok:true}
 };
 const {result}=await mockedRun([{tool_calls:[tc('click_element',{ref:'e99',expectedLabel:'Enviar'})]},{content:'Tentei.'}],adapter);
 assert.equal(clicks,0);assert.equal(result.metrics.toolFailures,1);
 assert.equal(result.metrics.recoveredTargets,0);
});

test('Diagnóstico distingue ações verificadas de inconclusivas',()=>{
 assert.equal(diagnoseRun({mutations:2,verifiedProofs:1,pendingVerification:false}).state,'verified');
 const d=diagnoseRun({mutations:1,verifiedProofs:0,pendingVerification:true,toolFailures:1,failureKinds:{stale_target:1}});
 assert.equal(d.state,'needs_review');assert.ok(d.problems.some(p=>p.code==='unverified'));
 assert.equal(classifyToolFailure(new Error('PREVIEW_INDISPONIVEL')),'stale_target');
});

test('Quatro snapshots idênticos sem mudança são interrompidos',async()=>{
 const adapter={getOrigin:async()=> 'https://site.example',preview:async()=>null,
  execute:async()=>({ok:true,url:'https://site.example',title:'Site',text:'imutável',elements:[]})};
 const replies=Array.from({length:6},()=>({tool_calls:[tc('get_page',{})]}));
 const {result}=await mockedRun(replies,adapter);
 assert.ok(result.metrics.stalledObservations>=1);
 assert.ok(result.metrics.toolFailures>=1);
});

test('Texto de confirmação já presente ANTES do clique não serve como prova nova',()=>{
 const old={document:globalThis.document,location:globalThis.location,getComputedStyle:globalThis.getComputedStyle,innerWidth:globalThis.innerWidth,innerHeight:globalThis.innerHeight};
 class B {constructor(){this.tagName='BUTTON';this.isConnected=true;this.innerText='Abrir';this.name='Abrir';this.id='btn';}
   getAttribute(){return null;}getBoundingClientRect(){return {x:15,y:15,width:100,height:25};}scrollIntoView(){}closest(){return null;}
   click(){} }
 const el=new B();const doc={title:'Demo',body:{innerText:'Mensagem enviada'},querySelectorAll:()=>[el],elementFromPoint:()=>el};
 Object.assign(globalThis,{document:doc,location:{href:'https://site.example'},getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1',pointerEvents:'auto'}),innerWidth:900,innerHeight:700});
 try {
  pageOperation('snapshot',{});pageOperation('click',{ref:'e1'});
  const weak=pageOperation('verify',{containsText:'Mensagem enviada'});
  assert.equal(weak.verified,false);assert.equal(weak.evidence,'already_present');
  doc.body.innerText='Mensagem enviada - segunda confirmação';
  const different=pageOperation('verify',{containsText:'segunda confirmação'});
  assert.equal(different.verified,true);assert.equal(different.evidence,'changed_state');
 }finally{for(const [k,v] of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});

test('Clique bloqueado quando outro elemento encobre o alvo',()=>{
 const old={document:globalThis.document,location:globalThis.location,getComputedStyle:globalThis.getComputedStyle,innerWidth:globalThis.innerWidth,innerHeight:globalThis.innerHeight};
 class B{constructor(){this.tagName='BUTTON';this.isConnected=true;this.innerText='Enviar';this.id='enviar';}getAttribute(){return null;}getBoundingClientRect(){return {x:10,y:10,width:100,height:30};}closest(){return null;}scrollIntoView(){}click(){throw Error('Não deveria clicar');}}
 const el=new B();Object.assign(globalThis,{document:{title:'Teste',body:{innerText:'Email'},querySelectorAll:()=>[el],elementFromPoint:()=>({})},location:{href:'https://site.example'},getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1',pointerEvents:'auto'}),innerWidth:900,innerHeight:700});
 try{pageOperation('snapshot',{});assert.throws(()=>pageOperation('click',{ref:'e1'}),/ALVO_ENCOBERTO/);}
 finally{for(const [k,v] of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});
