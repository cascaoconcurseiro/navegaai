import test from 'node:test';
import assert from 'node:assert/strict';
import {validOrigin,normalizeSiteMode,checkSiteAccess,checkCdpGrant} from '../src/site-permissions.js';
test('somente origens http(s) exatas são aceitas como permissão persistente',()=>{
  assert.equal(validOrigin('https://example.com'),'https://example.com');
  for(const url of ['chrome://extensions','file:///etc/passwd','https://example.com/path','https://u:p@example.com','javascript:alert(1)']){
    assert.throws(()=>validOrigin(url));
  }
});
test('sites desconhecidos solicitam permissão e sites bloqueados não têm acesso',()=>{
  assert.equal(checkSiteAccess('https://site.test',{}).needsConsent,true);
  assert.equal(checkSiteAccess('https://site.test',{'https://site.test':'allow'}).allowed,true);
  assert.equal(checkSiteAccess('https://site.test',{'https://site.test':'block'}).blocked,true);
  assert.equal(normalizeSiteMode('unsafe'),'ask');
});
test('concessão CDP precisa coincidir com execução e aba; falsy por padrão',()=>{
  const run={runId:'run-1',tabId:31,cdpGranted:true};
  assert.equal(checkCdpGrant(run,{runId:'run-1',tabId:31}),true);
  assert.equal(checkCdpGrant({...run,cdpGranted:false},{runId:'run-1',tabId:31}),false);
  assert.equal(checkCdpGrant(run,{runId:'run-2',tabId:31}),false);
  assert.equal(checkCdpGrant(run,{runId:'run-1',tabId:32}),false);
  assert.equal(checkCdpGrant(null,{runId:'run-1',tabId:31}),false);
});
