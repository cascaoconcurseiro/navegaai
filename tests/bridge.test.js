import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';

const listen=(server,port)=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
const close=server=>new Promise(resolve=>server.close(resolve));

test('ponte local autentica e encaminha protocolo MCP ao servidor real simulado',async()=>{
 const upstream=http.createServer(async(req,res)=>{
   let content='';for await(const chunk of req)content+=chunk.toString();
   res.writeHead(200,{'content-type':'application/json','mcp-session-id':'abc123'});
   res.end(JSON.stringify({jsonrpc:'2.0',id:JSON.parse(content).id,result:{ok:true}}));
 });
 await listen(upstream,19317);
 const child=spawn(process.execPath,['bridge/bridge.mjs'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,NEO_MCP_URL:'http://127.0.0.1:19317/mcp',NAVEGAAI_BRIDGE_PORT:'19318'},stdio:['ignore','pipe','pipe']});
 let buffer='';
 const token=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Ponte não iniciou. '+buffer)),4000);
   child.stdout.on('data',b=>{buffer+=b.toString();const m=buffer.match(/TOKEN TEMPORÁRIO: ([0-9a-f]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});
   child.once('error',reject);
 });
 try{
   const req={method:'POST',headers:{'content-type':'application/json','origin':'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','x-navegaai-token':token},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})};
   const yes=await fetch('http://127.0.0.1:19318/mcp',req);
   assert.equal(yes.status,200);
   assert.equal(yes.headers.get('mcp-session-id'),'abc123');
   assert.equal((await yes.json()).result.ok,true);
   const no=await fetch('http://127.0.0.1:19318/mcp',{...req,headers:{...req.headers,'x-navegaai-token':'wrong'}});
   assert.equal(no.status,403);
 }finally{child.kill('SIGTERM');await close(upstream);}
});
