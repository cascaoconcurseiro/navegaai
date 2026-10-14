import test from 'node:test';import assert from 'node:assert/strict';
import {buildContinuation,isContinuation} from '../src/continuation.js';
test('continuar usa o objetivo anterior e não sugere repetição cega',()=>{
 const thread={status:'needs_review',messages:[{role:'user',text:'Abra Gmail e prepare um rascunho'},{role:'agent',text:'Resultado incerto'}]};
 const out=buildContinuation('continue',thread,[{event:'agent_indeterminate_action',name:'click_element'},{event:'run_finished',outcome:'needs_review'}]);
 assert.equal(out.resumed,true);assert.match(out.prompt,/Abra Gmail/);assert.match(out.prompt,/get_page/);assert.match(out.prompt,/não repita envio/i);
});
test('não inventa objetivo quando não existe conversa anterior',()=>{
 const out=buildContinuation('Continue',{messages:[]},[]);
 assert.equal(out.resumed,false);assert.match(out.prompt,/não há objetivo anterior/);
});
test('uma mensagem normal não é reescrita',()=>{
 assert.equal(isContinuation('Como continuar isso?'),false);
 assert.equal(buildContinuation('Abra Google',{messages:[]}).prompt,'Abra Google');
});
