import test from 'node:test';
import assert from 'node:assert/strict';
import {compactOldContext} from '../src/context-budget.js';

test('Compacting stale snapshots retains tool-call protocol and recent observations',()=>{
 const messages=[{role:'system',content:'guardrails'}];
 for(let i=0;i<15;i++){
  messages.push({role:'assistant',tool_calls:[{id:'t'+i,function:{name:'get_page',arguments:'{}'}}]});
  messages.push({role:'tool',tool_call_id:'t'+i,name:'get_page',content:'S'.repeat(2500)});
 }
 const result=compactOldContext(messages,{keepRecentTools:4,maxOldToolChars:320});
 assert.equal(result.compacted,11);
 assert.equal(messages.filter(m=>m.role==='tool').length,15);
 assert.equal(messages.at(-1).content.length,2500);
 assert.equal(messages[2].tool_call_id,'t0');
 assert.ok(messages[2].content.length<150);
});

test('Old vision input stripped but newest screenshot still available',()=>{
 const image={role:'user',content:[{type:'text',text:'observe'},{type:'image_url',image_url:{url:'data:image/jpeg;base64,abcdef'}}]};
 const messages=[image];
 for(let i=0;i<10;i++)messages.push({role:'tool',tool_call_id:'x'+i,content:'r'.repeat(500)});
 compactOldContext(messages,{keepRecentTools:3});
 assert.equal(messages[0].content[0].type,'text');
 assert.equal(messages[0].content.length,1);
});
