import test from 'node:test';
import assert from 'node:assert/strict';
import {withDeadline} from '../src/deadlines.js';
test('termina normalmente se a ferramenta respondeu',async()=>{
 assert.equal(await withDeadline(Promise.resolve('ok'),100),'ok');
});
test('uma ferramenta travada devolve resultado indeterminado, não sucesso',async()=>{
 await assert.rejects(withDeadline(new Promise(()=>{}),10,'click_element'),/TIMEOUT_INDETERMINADO.*click_element/);
});
test('prazo inválido não é aceito silenciosamente',async()=>{
 await assert.rejects(withDeadline(Promise.resolve('ok'),0),/Prazo inválido/);
});
