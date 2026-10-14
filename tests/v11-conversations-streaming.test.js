import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureConversation,saveConversationSnapshot,closeConversation,listConversations} from '../src/conversations.js';
import {parseCompletionStream} from '../src/providers.js';
import {makeSkill,suggestSkill,listSkills,approveSkill} from '../src/skills.js';

const mockStorage=()=>{const map={};return {get:async(keys)=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,map[k]])),set:async(data)=>Object.assign(map,data),dump:()=>map};};

test('Conversa mantém ID independente da aba, reabre em nova aba sem perder mensagens',async()=>{
 const storage=mockStorage();const first=await ensureConversation(storage,101,{url:'https://example.com/a'});
 const thread={tabId:101,threadId:first.id,version:2,status:'completed',messages:[{role:'user',text:'Gere relatório mensal',at:1},{role:'agent',text:'Concluído',at:2}],history:[]};
 await saveConversationSnapshot(storage,101,thread);
 await closeConversation(storage,101);
 const afterClose=await listConversations(storage);assert.equal(afterClose[0].tabId,null);assert.equal(afterClose[0].title,'Gere relatório mensal');
 const reopened=await ensureConversation(storage,202,{restoreId:first.id,url:'https://example.com/a'});
 assert.equal(reopened.id,first.id);
 const restored=storage.dump()['navegaThreadV1:202'];
 assert.equal(restored.messages.length,2);assert.equal(restored.tabId,202);assert.equal(restored.runId,null);
 assert.equal(await ensureConversation(storage,202),reopened);
});

test('Duas conversas não compartilham ID ou histórico',async()=>{
 const storage=mockStorage(),a=await ensureConversation(storage,15),b=await ensureConversation(storage,16);
 assert.notEqual(a.id,b.id);await saveConversationSnapshot(storage,15,{tabId:15,threadId:a.id,messages:[{role:'user',text:'Tarefa A'}],status:'running'});
 await saveConversationSnapshot(storage,16,{tabId:16,threadId:b.id,messages:[{role:'user',text:'Tarefa B'}],status:'running'});
 assert.equal((await listConversations(storage)).length,2);
 assert.notEqual(storage.dump()['navegaConversationSnapshotV1:'+a.id].messages[0].text,storage.dump()['navegaConversationSnapshotV1:'+b.id].messages[0].text);
});

test('SSE fragmentado agrega texto, uso e ferramentas em ordem',async()=>{
 const events=[
 'data: '+JSON.stringify({choices:[{delta:{content:'Oi ',tool_calls:[{index:0,id:'call-1',function:{name:'click_element',arguments:'{"ref":'}}]}}]})+'\n\n',
 'data: '+JSON.stringify({choices:[{delta:{content:'tudo',tool_calls:[{index:0,function:{arguments:'"e1"}'}}]}}]})+'\n\n',
 'data: '+JSON.stringify({choices:[],usage:{total_tokens:12}})+'\n\n',
 'data: [DONE]\n\n'
 ].join('');
 const encoder=new TextEncoder(),bytes=encoder.encode(events);let i=0;
 const stream=new ReadableStream({pull(controller){if(i>=bytes.length){controller.close();return;}const n=Math.min(bytes.length,i+(i%7)+1);controller.enqueue(bytes.slice(i,n));i=n;}});
 const progress=[];const result=await parseCompletionStream(stream,t=>progress.push(t));
 assert.equal(result.content,'Oi tudo');assert.equal(result.tool_calls[0].function.name,'click_element');assert.equal(result.tool_calls[0].function.arguments,'{"ref":"e1"}');assert.equal(result.usage.total_tokens,12);assert.deepEqual(progress,['Oi ','Oi tudo']);
});

test('Habilidades exigem evidência e confirmação antes de reutilizar',async()=>{
 const storage=mockStorage();assert.throws(()=>makeSkill({origin:'https://example.com',prompt:'teste',verifiedProofs:0}),/evidência/);
 const suggestion=await suggestSkill(storage,{origin:'https://example.com',prompt:'Gerar relatório',verifiedProofs:2,sourceRunId:'r1'});
 assert.equal(suggestion.status,'suggested');const accepted=await approveSkill(storage,suggestion.id);assert.equal(accepted.status,'approved');
 assert.equal((await listSkills(storage,'https://example.com'))[0].status,'approved');
});

test('Captura visual é somente leitura e não expõe imagem nos resultados de log',async()=>{
 const {isMutation}=await import('../src/policies.js');
 const {traceOutcome}=await import('../src/agent.js');
 assert.equal(isMutation('capture_viewport'),false);
 const captured={ok:true,imageUrl:'data:image/jpeg;base64,SECRETFRAME',mimeType:'image/jpeg'};
 const publicLog=JSON.stringify(traceOutcome('capture_viewport',captured));
 assert.equal(publicLog.includes('SECRETFRAME'),false);
});

test('Habilidade potencialmente sensível não é aprendida sem salvaguardas',()=>{
 assert.throws(()=>makeSkill({origin:'https://example.com',prompt:'Enviar relatório para pessoa@exemplo.com',verifiedProofs:2}),/sensível/);
 assert.throws(()=>makeSkill({origin:'https://example.com',prompt:'Usar senha supersecreta',verifiedProofs:2}),/sensível/);
});
