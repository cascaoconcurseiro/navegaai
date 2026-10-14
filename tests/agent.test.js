import test from 'node:test';
import assert from 'node:assert/strict';
import {runAgent} from '../src/agent.js';
import {runDemo} from '../src/demo.js';

test('agente executa chamada real simulada, aguarda permissão e devolve resposta',async()=>{
 const old=globalThis.fetch;const calls=[];let iterations=0;let approvals=0;const events=[];
 globalThis.fetch=async(url,options)=>{
   const data=JSON.parse(options.body);calls.push(data);iterations++;
   const message=iterations===1?
     {role:'assistant',content:null,tool_calls:[{id:'call01',type:'function',function:{name:'click_element',arguments:'{"ref":"e2"}'}}]}:
     {role:'assistant',content:'Cliquei no botão após aprovação.'};
   return {ok:true,json:async()=>({choices:[{message}]})};
 };
 try {
   const adapter={execute:async(name,args)=>({ok:true,name,args})};
   const settings={provider:'custom',baseURL:'http://localhost:1234/v1',model:'mock',apiKey:'',confirmActions:true,maxSteps:4};
   const tools=[{type:'function',function:{name:'click_element',description:'click',parameters:{type:'object',properties:{ref:{type:'string'}}}}}];
   const result=await runAgent({userMessage:'clique',history:[],settings,adapter,tools,signal:new AbortController().signal,onEvent:e=>events.push(e),requestApproval:async()=>{approvals++;return true;}});
   assert.equal(approvals,1);
   assert.match(result.answer,/Cliquei no botão após aprovação/);
   assert.match(result.answer,/Resultado não confirmado/);
   assert.equal(calls[1].messages.at(-1).role,'tool');
   assert.ok(events.some(e=>e.type==='tool_success'));
 }finally{globalThis.fetch=old;}
});
test('nega ação não autorizada e nunca chama navegador',async()=>{
 const old=globalThis.fetch;let iterations=0;let executed=0;
 globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:++iterations===1?{role:'assistant',tool_calls:[{id:'x',function:{name:'click_element',arguments:'{"ref":"e1"}'}}]}:{content:'Ação não realizada.'}}]})});
 try{
  const settings={provider:'custom',baseURL:'http://localhost:1234/v1',model:'test',maxSteps:3,confirmActions:true};
  const result=await runAgent({userMessage:'clique',history:[],settings,adapter:{execute:async()=>{executed++;}},tools:[{type:'function',function:{name:'click_element'}}],signal:new AbortController().signal,onEvent:()=>{},requestApproval:async()=>false});
  assert.equal(executed,0);assert.match(result.answer,/Ação não realizada/);assert.equal(result.metrics.unfulfilledAction,true);
 }finally{globalThis.fetch=old;}
});
test('demonstração resume texto e consulta ferramentas reais',async()=>{
 const names=[];const events=[];
 const adapter={execute:async(name)=>{names.push(name);return JSON.stringify({title:'Demo',url:'https://example.com',text:'Primeira frase. Segunda frase. Terceira frase.',elements:['e1 a href="https://x.com"']});}};
 const result=await runDemo({userMessage:'Resuma esta página',adapter,signal:new AbortController().signal,onEvent:e=>events.push(e),requestApproval:async()=>true});
 assert.deepEqual(names,['get_page']);assert.match(result.answer,/Primeira frase/);
});

test('demonstração respeita o modo somente leitura e exige aprovação de navegação',async()=>{
 const adapter={execute:async()=>{throw Error('Não deveria ser chamado');}};
 await assert.rejects(runDemo({userMessage:'abra https://example.com/',adapter,settings:{approvalMode:'read_only'},
  signal:new AbortController().signal,onEvent:()=>{},requestApproval:async()=>true}),/somente leitura/);
 let approvals=0;
 await assert.rejects(runDemo({userMessage:'abra https://example.com/',adapter,settings:{approvalMode:'review'},
  signal:new AbortController().signal,onEvent:()=>{},requestApproval:async()=>{approvals++;return false;}}),/não autorizada/);
 assert.equal(approvals,1);
});
