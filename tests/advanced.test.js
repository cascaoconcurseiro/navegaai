import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeModels,searchModels} from '../src/models.js';
import {nextCron,parseCron,matchesCron} from '../src/cron.js';
import {appendAudit,getAudit,verifyAudit} from '../src/audit.js';
import {addMemory,getMemories,siteOrigin} from '../src/memory.js';

function storageStub(){const data={};return {
  async get(key){if(typeof key==='string')return {[key]:data[key]};return Object.fromEntries(key.map(k=>[k,data[k]]));},
  async set(obj){Object.assign(data,obj);}
};}

test('OpenRouter mantém modelos com e sem ferramentas sem impor shortlist',()=>{
 const models=normalizeModels({data:[
   {id:'vendor/vision',name:'Visão',context_length:64000,supported_parameters:['tools','response_format'],pricing:{prompt:'0.1',completion:'0.5'}},
   {id:'vendor/plain',name:'Chat simples',supported_parameters:[]}
 ]});
 assert.equal(models.length,2);
 assert.equal(searchModels(models,'vendor').length,2);
 assert.equal(searchModels(models,'',true).length,1);
 assert.equal(searchModels(models,'',true)[0].id,'vendor/vision');
});

test('cron avalia agenda diária local e impede expressão inválida',()=>{
 const expr='0 9 * * *';const parsed=parseCron(expr);
 assert.equal(matchesCron(parsed,new Date(2026,9,14,9,0,0)),true);
 assert.equal(matchesCron(parsed,new Date(2026,9,14,10,0,0)),false);
 assert.equal(new Date(nextCron(expr,new Date(2026,9,14,8,30))).getHours(),9);
 assert.throws(()=>parseCron('* * *'),/5 campos/);
 assert.throws(()=>parseCron('99 * * * *'),/fora do intervalo/);
});

test('auditoria encadeada detecta edição de registro e redige segredos',async()=>{
 const storage=storageStub();
 await appendAudit(storage,{event:'run_started',runId:'r1',token:'segredo'});
 await appendAudit(storage,{event:'tool_success',runId:'r1',tool:'click_element',ms:42});
 const logs=await getAudit(storage);
 assert.equal(logs.length,2);
 assert.equal(logs[0].token,'[redigido]');
 assert.equal(logs[1].prevHash,logs[0].hash);
 assert.equal(await verifyAudit(logs),true);
 logs[0].runId='alterado';
 assert.equal(await verifyAudit(logs),false);
});

test('memórias ficam segmentadas por origem',async()=>{
 const storage=storageStub();
 await addMemory(storage,'https://example.com','Prefiro português');
 assert.equal((await getMemories(storage,'https://example.com')).length,1);
 assert.equal((await getMemories(storage,'https://outro.com')).length,0);
 assert.equal(siteOrigin('https://example.com/a'), 'https://example.com');
});
