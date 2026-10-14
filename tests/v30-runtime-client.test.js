import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeRequest,validateRuntimeUrl} from '../src/runtime-client.js';

for(const url of ['https://localhost:8765','http://evil.com','http://localhost.evil.com:8765',
 'http://user:pw@127.0.0.1:8765/','file:///x','http://127.0.0.1:8765/privileged']){
 test('runtime reject '+url,()=>assert.throws(()=>validateRuntimeUrl(url)));
}
test('runtime requires bearer token',async()=>{
 await assert.rejects(runtimeRequest({url:'http://127.0.0.1:8765/',token:'',path:'/health',fetchFn:async()=>{throw Error('never')}}),/token/);
});
test('runtime client enforces URL and token',async()=>{
 let captured;
 const result=await runtimeRequest({url:'http://127.0.0.1:8765/',token:'a'.repeat(30),path:'/health',
  fetchFn:async(url,options)=>{captured={url,options};return {ok:true,json:async()=>({ok:true})};}});
 assert.equal(result.ok,true);assert.equal(captured.url,'http://127.0.0.1:8765/health');
 assert.equal(captured.options.headers.Authorization,'Bearer '+('a'.repeat(30)));
});
test('runtime HTTP failures retain code and limited body',async()=>{
 await assert.rejects(runtimeRequest({url:'http://127.0.0.1:8765/',token:'x'.repeat(30),path:'/health',
  fetchFn:async()=>({ok:false,status:401,text:async()=>'{"detail":"bad token"}'})}),/HTTP 401/);
});
