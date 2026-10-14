import test from 'node:test';
import assert from 'node:assert/strict';
import {NeoMcp} from '../src/neo-mcp.js';

test('handshake MCP, lista de ferramentas, sessão, chamada e restrição',async()=>{
 const old=globalThis.fetch; const calls=[];
 globalThis.fetch=async(url,options)=>{
   const data=JSON.parse(options.body);calls.push({data,headers:options.headers});
   const base={status:200,ok:true,headers:new Headers({'content-type':'application/json','mcp-session-id':'session-123'})};
   if(data.method==='initialize')return {...base,text:async()=>JSON.stringify({jsonrpc:'2.0',id:data.id,result:{protocolVersion:'2025-03-26',capabilities:{},serverInfo:{name:'neo',version:'1'}}})};
   if(data.method==='notifications/initialized')return {...base,status:202,text:async()=>''};
   if(data.method==='tools/list')return {...base,text:async()=>JSON.stringify({jsonrpc:'2.0',id:data.id,result:{tools:[
     {name:'snapshot',description:'Read page',inputSchema:{type:'object',properties:{page:{type:'integer'}}}},
     {name:'evaluate',description:'Do JS',inputSchema:{type:'object',properties:{code:{type:'string'}}}}
   ]}})};
   return {...base,text:async()=>JSON.stringify({jsonrpc:'2.0',id:data.id,result:{content:[{type:'text',text:'Tudo certo'}]}})};
 };
 try {
   const neo=new NeoMcp('http://127.0.0.1:9200/mcp','secret');
   assert.equal((await neo.initialize()).length,1);
   assert.equal(neo.openAiTools()[0].function.name,'neo_snapshot');
   assert.equal(typeof (await neo.execute('neo_snapshot',{})),'string');
   await assert.rejects(()=>neo.execute('neo_evaluate',{code:'alert(1)'}));
   assert.equal(calls[1].headers['Mcp-Session-Id'],'session-123');
   assert.equal(calls[3].headers['X-NavegaAI-Token'],'secret');
 }finally{globalThis.fetch=old;}
});
test('suporta respostas de ferramentas em SSE',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async(url,options)=>({ok:true,status:200,headers:new Headers({'content-type':'text/event-stream'}),text:async()=>`event: message\ndata: ${JSON.stringify({jsonrpc:'2.0',id:JSON.parse(options.body).id,result:{ok:true}})}\n\n`});
 try {const neo=new NeoMcp('http://localhost:9200/mcp');assert.deepEqual(await neo.send('tools/list'),{ok:true});}
 finally{globalThis.fetch=old;}
});
