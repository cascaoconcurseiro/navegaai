"""Gera capturas visuais com APIs simuladas; NÃO testa extensão instalada."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]

out=root.parent/'NavegaAI-Visual';out.mkdir(exist_ok=True)
mock_js=r'''(() => {
let data={settings:{provider:'openrouter',model:'deepseek/deepseek-chat',baseURL:'https://openrouter.ai/api/v1',backend:'chrome',approvalMode:'auto',theme:'dark',maxSteps:20,rememberKey:true,streamResponses:true},savedKey:'preview-key'};
const model={id:'deepseek/deepseek-chat',name:'DeepSeek Chat',context:64000,tools:true,promptPrice:'0.0000001',completionPrice:'0.0000002'};
const messages=[{role:'user',text:'Abra o Gmail e prepare um e-mail de teste',at:Date.now()-100000},{role:'event',event:{type:'tool_start',name:'navigate_tab',step:1,at:Date.now()-80000,ok:true}},{role:'agent',text:'Abri o Gmail na aba desta conversa. Preparei o rascunho e estou aguardando a verificação do resultado.',at:Date.now()-70000}];
const reply={threadId:'c-demo-001',tabId:91,version:2,messages,status:'needs_review',runId:null,approval:null};
window.chrome={
 runtime:{getManifest:()=>({permissions:['sidePanel','storage']}),sendMessage:async m=>{
 let v;
 switch(m.type){case 'CHAT_STATUS':v=reply;break;case 'MODELS':v={models:[model],updatedAt:Date.now()};break;case 'CHAT_LIST':v=[{id:'c-demo-001',title:'Abrir Gmail e preparar e-mail',status:'closed',tabId:null,updatedAt:Date.now()-4000,lastUrl:'https://mail.google.com/mail/u/0/'},{id:'c-demo-002',title:'Pesquisar preços de passagens',status:'running',tabId:92,updatedAt:Date.now()-30000,lastUrl:'https://www.google.com/travel/'},{id:'c-demo-003',title:'Analisar planilha de despesas',status:'closed',tabId:null,updatedAt:Date.now()-500000,lastUrl:'https://docs.google.com/'}];break;
 case 'JOBS':v=[{id:'j1',tabId:91,origin:'https://mail.google.com',prompt:'Resuma e-mails não lidos',cron:'0 9 * * *',lastRun:null}];break;
 case 'MEMORY_LIST':v=[{id:'mem1',text:'Preferir relatórios objetivos em português',at:Date.now()}];break;
 case 'SKILLS_LIST':v=[{id:'sk1',title:'Gerar relatório mensal',status:'suggested',verifiedProofs:2}];break;
 case 'AUDIT_QUERY':v=[{event:'run_requested',at:new Date(Date.now()-90000).toISOString(),tabId:91,requestPreview:'Abra o Gmail e prepare um e-mail de teste'}, {event:'agent_tool_start',at:new Date(Date.now()-80000).toISOString(),name:'navigate_tab',tabId:91,ms:1250},{event:'agent_verification_failed',at:new Date().toISOString(),tabId:91,error:'Faltou confirmação independente de envio'}];break;
 case 'SITE_LIST':v={'https://mail.google.com':'allow'};break;
 case 'AUDIT_LIST':v=[];break;
 case 'SKILLS_APPROVE':v={status:'approved'};break;
 default:v={ok:true};
 }return {ok:true,data:v};}},
 storage:{local:{get:async k=> typeof k==='string'?{[k]:data[k]}:Object.fromEntries(k.map(x=>[x,data[x]])),set:async x=>Object.assign(data,x),remove:async k=>{delete data[k];}},session:{get:async()=>({apiKey:'preview-key'}),set:async()=>{},remove:async()=>{}},onChanged:{addListener:()=>{}}},
 tabs:{query:async()=>[{id:91,title:'Gmail — Caixa de entrada',url:'https://mail.google.com/mail/u/0/',active:true}],get:async id=>({id,title:'Gmail — Caixa de entrada',url:'https://mail.google.com/mail/u/0/',active:true}),onActivated:{addListener:()=>{}}},
 sidePanel:{open:async()=>{}}
};
})();'''
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page(viewport={'width':430,'height':860},device_scale_factor=1)
 # Bundle the local modules into a single in-page script for the visual test only.
 mods=[('policies',['validateApiBase','validateMcpUrl','compact','scrubError']),('providers',['PROVIDERS','createSettings','normalizeSettings']),('models',['searchModels']),('audit',['verifyAudit']),('memory',['siteOrigin'])]
 modules=[]
 import re
 for name,names in mods:
  code=(root/'src'/f'{name}.js').read_text()
  code=re.sub(r'^import .*?;\s*$', '',code,flags=re.M)
  code=re.sub(r'\bexport\s+(?=(?:async\s+)?function|const|class)', '',code)
  deps={'providers':'const {validateApiBase,scrubError}=__policies;', 'audit':'', 'memory':'', 'models':'', 'policies':''}[name]
  modules.append(f'const __{name}=(()=>{{{deps}\n{code}\nreturn {{{",".join(names)}}};}})();')
 bindings='const {PROVIDERS,createSettings,normalizeSettings}=__providers;const {validateApiBase,validateMcpUrl,compact,scrubError}=__policies;const {searchModels}=__models;const {verifyAudit}=__audit;const {siteOrigin}=__memory;'
 main=(root/'src/panel.js').read_text()
 main=re.sub(r'^import .*?;\s*$', '',main,flags=re.M)
 html=(root/'src/panel.html').read_text()
 html=html.replace('<link rel="stylesheet" href="panel.css">','<style>'+ (root/'src/panel.css').read_text()+'</style>')
 html=html.replace('<script type="module" src="panel.js"></script>','<script>'+mock_js+'</script><script>'+''.join(modules)+bindings+main+'</script>')
 page_errors=[]
 page.on('pageerror', lambda error: page_errors.append(str(error)))
 page.set_content(html,wait_until='load')
 page.wait_for_timeout(250)
 page.screenshot(path=str(out/'1-chat.png'),full_page=True)
 for name,selector in [('2-conversas','#conversationsBtn'),('3-configuracoes','#settingsBtn'),('4-memoria-cron','#toolsBtn'),('5-auditoria','#traceBtn')]:
  page.click('#conversationsBackBtn' if name=='3-configuracoes' else '#backBtn' if name=='4-memoria-cron' else '#toolsBackBtn' if name=='5-auditoria' else 'body') if False else None
  if name=='3-configuracoes':page.click('#conversationsBackBtn')
  if name=='4-memoria-cron':page.click('#backBtn')
  if name=='5-auditoria':page.click('#toolsBackBtn')
  page.click(selector)
  page.wait_for_timeout(180)
  page.screenshot(path=str(out/(name+'.png')),full_page=True)
 assert page.locator('.trace-event').count()==3,'A auditoria deveria exibir pedido, ferramenta e falha.'
 page.click('#traceReplayBtn');page.wait_for_timeout(800)
 assert page.locator('.trace-event.replay-active').count()==1,'O replay de auditoria não destacou a etapa.'
 assert not page_errors, f'Erros JavaScript na UI: {page_errors}'
 b.close()
print('Screenshots generated:',len(list(out.glob('*.png'))),out)
