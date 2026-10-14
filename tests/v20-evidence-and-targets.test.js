import test from 'node:test';
import assert from 'node:assert/strict';
import {ProofLedger} from '../src/proof-engine.js';
import {ChromeBrowser} from '../src/chrome-browser.js';

test('prova de ação anterior não valida a próxima ação, mesmo com texto correto',()=>{
 const l=new ProofLedger();
 l.dispatched({stepId:'1.1',name:'click_element',actionToken:'actionA'});
 l.dispatched({stepId:'2.1',name:'click_element',actionToken:'actionB'});
 assert.equal(l.evaluate({verified:true,evidence:'changed_state',actionToken:'actionA'},'3.1').accepted,false);
 assert.deepEqual(l.summary().unverifiedSteps,['1.1','2.1']);
 assert.equal(l.evaluate({verified:true,evidence:'changed_state',actionToken:'actionB'},'4.1').accepted,true);
 assert.deepEqual(l.summary().unverifiedSteps,['1.1']);
});

test('resposta do modelo não pode forjar prova sem token emitido pelo navegador',()=>{
 const l=new ProofLedger();l.dispatched({stepId:'1.1',name:'click_element',actionToken:'genuine'});
 assert.equal(l.evaluate({verified:true,evidence:'changed_state'},'2.1').accepted,false);
 assert.equal(l.evaluate({verified:true,evidence:'current_state',actionToken:'genuine'},'2.2').accepted,false);
 assert.equal(l.summary().proofCount,0);
});

test('confirmação de campo local não é evidência de envio externo',()=>{
 const l=new ProofLedger();
 l.dispatched({stepId:'1.1',name:'fill_element',actionToken:'fill1',localConfirmed:true});
 l.dispatched({stepId:'2.1',name:'click_element',actionToken:'send1'});
 assert.equal(l.summary().localProofCount,1);
 assert.equal(l.summary().unverifiedCount,1);
 assert.equal(l.evaluate({verified:true,evidence:'changed_state',actionToken:'fill1'},'3.1').accepted,false);
});

test('alvo parcialmente parecido não pode receber clique',async()=>{
 const b=new ChromeBrowser(10);b.inject=async()=>({ref:'e1',visible:true,x:20,y:30,label:'Enviar e apagar tudo',actionable:true});
 await assert.rejects(b.preview('click_element',{ref:'e1',expectedLabel:'Enviar'}),/ALVO_INCOMPATIVEL/);
});

test('um mesmo token não pode verificar novamente outra operação',()=>{
 const l=new ProofLedger();
 l.dispatched({stepId:'1.1',name:'navigate_tab',actionToken:'nav1'});
 assert.equal(l.evaluate({verified:true,evidence:'changed_state',actionToken:'nav1'},'2.1').accepted,true);
 l.dispatched({stepId:'3.1',name:'click_element',actionToken:'send2'});
 assert.equal(l.evaluate({verified:true,evidence:'changed_state',actionToken:'nav1'},'4.1').accepted,false);
});

test('verificação devolve token do último comando da aba isolada',async()=>{
 const b=new ChromeBrowser(5);b.lastAction={token:'tab5-token',name:'click_element',at:Date.now()};
 b.inject=async()=>({ok:true,verified:true,evidence:'changed_state'});
 const r=await b.execute('verify_page',{containsText:'Feito'});
 assert.equal(r.actionToken,'tab5-token');
});
