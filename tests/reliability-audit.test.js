import test from 'node:test';
import assert from 'node:assert/strict';
import {runAgent,traceOutcome} from '../src/agent.js';
import {ChromeBrowser,chromeTools} from '../src/chrome-browser.js';
import {appendAudit,verifyAudit} from '../src/audit.js';
import {createExecutionEngine} from '../src/execution-engine.js';

const config={provider:'custom',model:'mock',baseURL:'http://localhost:1234/v1',apiKey:'',maxSteps:10,approvalMode:'skip'};
const makeTool=(name,args={})=>({id:crypto.randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}});
const provider=(messages)=>{let n=0;return async()=>({ok:true,json:async()=>({choices:[{message:messages[Math.min(n++,messages.length-1)]}]})});};
const adapter=(override={})=>({preview:async (_name,args)=>({ref:args.ref,visible:true,label:'Enviar',role:'button',tag:'button',x:40,y:40,disabled:false,sensitive:false}),getOrigin:async()=> 'https://mail.google.com',execute:async name=>name==='get_page'?{title:'Gmail',text:'Nova mensagem',elements:[]}:{ok:true,action:name},...override});
async function run(replies,browser=adapter()){
 const previous=globalThis.fetch;globalThis.fetch=provider(replies);const events=[];
 try {return {result:await runAgent({userMessage:'Enviar um teste',history:[],settings:config,adapter:browser,tools:chromeTools,signal:new AbortController().signal,onEvent:e=>events.push(e),requestApproval:async()=>true}),events};}
 finally{globalThis.fetch=previous;}
}

test('Não repete Enviar duas vezes após o primeiro comando ser aceito',async()=>{
 let sends=0;const a=adapter({execute:async name=>{if(name==='click_element')sends++;return name==='get_page'?{title:'Gmail',text:'Compose',elements:[]}:{ok:true};}});
 const {result,events}=await run([{tool_calls:[makeTool('click_element',{ref:'e3'})]},{tool_calls:[makeTool('click_element',{ref:'e3'})]},{content:'Tudo enviado.'}],a);
 assert.equal(sends,1);assert.equal(result.metrics.retryBlocks,1);
 assert.equal(result.metrics.toolFailures,1);assert.equal(result.metrics.pendingVerification,true);
 assert.match(result.answer,/Resultado não confirmado/);
 assert.ok(events.some(e=>e.type==='tool_error' && e.error.includes('ACAO_SENSIVEL_REPETIDA')));
});

test('Interrompe tentativas após três falhas seguidas e evita desperdício de tokens',async()=>{
 let calls=0;const a=adapter({preview:async(_name,args)=>({ref:args.ref,label:'Abrir menu',visible:true,tag:'button',x:5,y:5}),execute:async()=>{calls++;throw Error('preview transitório inválido');}});
 const {result,events}=await run(Array.from({length:7},()=>({tool_calls:[makeTool('click_element',{ref:'e8'})]})),a);
 assert.equal(calls,3);assert.equal(result.metrics.toolFailures,3);
 assert.equal(result.metrics.llmCalls,3);assert.equal(result.recoveryStopped,true);
 assert.ok(events.some(x=>x.type==='recovery_stopped'));
});

test('Verificação positiva anterior não certifica alterações posteriores',async()=>{
 const {result}=await run([
  {tool_calls:[makeTool('click_element',{ref:'e3'})]},
  {tool_calls:[makeTool('verify_page',{containsText:'mensagem enviada'})]},
  {tool_calls:[makeTool('fill_element',{ref:'e9',text:'Oi'})]},
  {content:'Concluído.'}
 ],adapter({execute:async name=>name==='verify_page'?{ok:true,verified:true,evidence:'changed_state',actionToken:'test-first-click'}:name==='get_page'?{title:'Gmail',elements:[],text:'mensagem enviada'}:{ok:true,actionToken:name==='click_element'?'test-first-click':'test-fill'}}));
 assert.equal(result.metrics.verifiedProofs,1);
 assert.equal(result.metrics.pendingVerification,true);
 assert.match(result.answer,/Resultado não confirmado/);
});

test('Retorno null da inspeção não provoca TypeError href nem clique sem alvo',async()=>{
 const saved=globalThis.chrome;let clicks=0;
 globalThis.chrome={tabs:{get:async()=>({url:'https://mail.google.com',id:12})},scripting:{executeScript:async()=>[{result:null}]}};
 try {const b=new ChromeBrowser(12);await b.initialize();
   await assert.rejects(b.execute('click_element',{ref:'e8'}),/PREVIEW_INDISPONIVEL/);
   assert.equal(clicks,0);
 }finally{globalThis.chrome=saved;}
});

test('Resultados negativos de verificação aparecem como não confirmados',()=>{
 const outcome=traceOutcome('verify_page',{ok:true,verified:false});
 assert.equal(outcome.status,'condição não confirmada');assert.equal(outcome.proofVerified,false);
});

test('Gravação simultânea de auditoria preserva sequência e hashes',async()=>{
 let db={};const storage={get:async k=>{await new Promise(r=>setTimeout(r,2));return {[k]:db[k]};},set:async x=>{await new Promise(r=>setTimeout(r,2));db={...db,...x};}};
 const writes=await Promise.all(Array.from({length:22},(_,i)=>appendAudit(storage,{event:'parallel',i})));
 assert.deepEqual(writes.map(x=>x.seq),Array.from({length:22},(_,i)=>i+1));
 assert.equal(await verifyAudit(db.navegaAuditV3),true);
});

test('Auditoria indisponível bloqueia início da execução antes de qualquer ação',async()=>{
 const saved=globalThis.chrome;let acts=0;const values={settings:{provider:'demo',approvalMode:'skip'}};
 const storage={get:async k=>Array.isArray(k)?Object.fromEntries(k.map(x=>[x,values[x]])):{[k]:values[k]},set:async x=>Object.assign(values,x)};
 const session={get:async()=>({})};
 globalThis.chrome={storage:{session},tabs:{get:async()=>({id:15,url:'https://example.org',status:'complete'})},runtime:{getManifest:()=>({permissions:[]})}};
 const engine=createExecutionEngine({chrome:globalThis.chrome,storage,log:async()=>{throw Error('storage full');},getSites:async()=>({}),setSite:async()=>{},updateRun:async()=>{acts++;},removeRun:async()=>{}});
 try{await assert.rejects(engine.start({tabId:15,userMessage:'Clique no link'}),/Auditoria indisponível/);
  assert.equal(acts,0);const t=await engine.query(15);assert.equal(t.status,'error');
 }finally{globalThis.chrome=saved;}
});

test('Modelo que apenas promete navegar sem executar ferramenta não conclui pedido',async()=>{
 const {result,events}=await run([{content:'Pronto, abri a página e enviei.'}]);
 assert.equal(result.metrics.mutations,0);
 assert.equal(result.metrics.unfulfilledAction,true);
 assert.match(result.answer,/Nenhuma ação de navegador foi realizada/);
 assert.ok(events.some(e=>e.type==='unfulfilled_action'));
});

test('Falhas com a mesma causa interrompem loop mesmo com get_page intercalado',async()=>{
 let attempts=0;
 const replies=[
  {tool_calls:[makeTool('click_element',{ref:'e22'})]},
  {tool_calls:[makeTool('get_page',{})]},
  {tool_calls:[makeTool('click_element',{ref:'e23'})]},
  {tool_calls:[makeTool('get_page',{})]},
  {tool_calls:[makeTool('click_element',{ref:'e24'})]},
  {content:'Não consegui.'}
 ];
 const {result,events}=await run(replies,adapter({preview:async(_name,args)=>({ref:args.ref,label:'Abrir menu',visible:true,tag:'button',x:5,y:5}),execute:async name=>{
  if(name==='click_element'){attempts++;throw Error("Cannot read properties of null (reading 'href')");}
  return {ok:true, title:'Gmail',text:'Caixa de entrada'};
 }}));
 assert.equal(attempts,3);
 assert.equal(result.recoveryStopped,true);
 assert.ok(events.some(x=>x.type==='recovery_stopped'));
});

test('Bloqueia alvo incorreto: Enviar apontando para Mais opções de formatação',async()=>{
 const saved=globalThis.chrome;let dispatched=0;
 globalThis.chrome={tabs:{get:async()=>({id:18,url:'https://mail.google.com'})},scripting:{executeScript:async ({args:[kind,opts]})=>{
  if(kind==='preview')return [{result:{ref:opts.ref,visible:true,x:32,y:19,label:'Mais opções de formatação',sensitive:false,disabled:false,opensNewTab:false}}];
  dispatched++;return [{result:{ok:true}}];
 }}};
 try {
  const b=new ChromeBrowser(18);await b.initialize();
  await assert.rejects(b.execute('click_element',{ref:'e103',expectedLabel:'Enviar'}),/ALVO_INCOMPATIVEL/);
  assert.equal(dispatched,0);
 }finally {globalThis.chrome=saved;}
});

test('Ferramenta que devolve null é registrada como erro, não sucesso silencioso',async()=>{
 const {result,events}=await run([{tool_calls:[makeTool('get_page',{})]},{content:'Li o site.'}],adapter({execute:async()=>null}));
 assert.equal(result.metrics.toolFailures,1);
 assert.ok(events.some(x=>x.type==='tool_error'&&x.error.includes('FERRAMENTA_SEM_RESPOSTA')));
 assert.match(result.answer,/falhas de ferramenta/);
});

test('Chamadas inválidas são contabilizadas e auditáveis',async()=>{
 const {result,events}=await run([{tool_calls:[makeTool('inexistente',{})]},{content:'Falhou.'}]);
 assert.equal(result.metrics.toolFailures,1);
 assert.ok(events.some(e=>e.type==='tool_error'&&e.name==='inexistente'));
});
