import test from 'node:test';
import assert from 'node:assert/strict';
import {validateApiBase,validateMcpUrl,validateWebUrl,approvalRequired,isSensitiveField,compact} from '../src/policies.js';

test('bloqueia protocolos perigosos e credenciais em URLs',()=>{
  for(const url of ['javascript:alert(1)','file:///etc/passwd','data:text/html,test','https://u:p@example.com']){
    assert.throws(()=>validateWebUrl(url));
  }
  assert.equal(validateWebUrl('https://example.com'), 'https://example.com/');
});
test('MCP aceita apenas localhost /mcp',()=>{
  assert.equal(validateMcpUrl('http://127.0.0.1:9200/mcp'),'http://127.0.0.1:9200/mcp');
  for (const url of ['http://example.com/mcp','https://127.0.0.1:9200/mcp','http://127.0.0.1:9200/evil']) assert.throws(()=>validateMcpUrl(url));
});
test('API exige https fora do PC',()=>{
  assert.equal(validateApiBase('https://api.deepseek.com/'),'https://api.deepseek.com');
  assert.equal(validateApiBase('http://localhost:1234/v1'),'http://localhost:1234/v1');
  assert.throws(()=>validateApiBase('http://api.example.com/v1'));
});
test('cliques solicitam aprovação sempre',()=>{
  assert.equal(approvalRequired('click_element',{},false),true);
  assert.equal(approvalRequired('neo_act',{},false),true);
  assert.equal(approvalRequired('fill_element',{},true),true);
  assert.equal(approvalRequired('get_page',{},true),false);
});
test('campos sensíveis bloqueados',()=>{
  assert.equal(isSensitiveField({type:'password'}),true);
  assert.equal(isSensitiveField({name:'credit_card_number'}),true);
  assert.equal(isSensitiveField({type:'text',name:'search'}),false);
});
test('limita tamanho de observações',()=>{
  assert.ok(compact('A'.repeat(100),20).includes('[Saída truncada]'));
});
test('navegação por ferramenta sempre exige aprovação para evitar exfiltração por URL',()=>{
  assert.equal(approvalRequired('navigate_tab',{url:'https://third-party.example/?data=secret'},false),true);
  assert.equal(approvalRequired('new_tab',{url:'https://example.com'},false),true);
  assert.equal(approvalRequired('neo_navigate',{url:'https://example.com'},false),true);
});
