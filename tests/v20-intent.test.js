import test from 'node:test';import assert from 'node:assert/strict';
import {requestsBrowserAction} from '../src/intent.js';
test('pedido de ação em forma de pergunta ainda exige execução',()=>{
 assert.equal(requestsBrowserAction('Você pode abrir meu Gmail?'),true);
 assert.equal(requestsBrowserAction('Consegue enviar um e-mail de teste?'),true);
 assert.equal(requestsBrowserAction('Clique em Salvar, por favor.'),true);
});
test('perguntas explicativas não exigem alteração do navegador',()=>{
 assert.equal(requestsBrowserAction('Como posso clicar em Salvar?'),false);
 assert.equal(requestsBrowserAction('Não envie esse e-mail'),false);
 assert.equal(requestsBrowserAction('Explique como abrir o Gmail'),false);
});
