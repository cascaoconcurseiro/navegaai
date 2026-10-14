import {PROVIDERS,createSettings,normalizeSettings} from './providers.js';
import {validateApiBase,validateMcpUrl,compact,scrubError} from './policies.js';
import {searchModels} from './models.js';
import {verifyAudit} from './audit.js';
import {siteOrigin} from './memory.js';

const $=id=>document.getElementById(id);
const ui={messages:$('messages'),welcome:$('welcome'),chatView:$('chatView'),settingsView:$('settingsView'),
  prompt:$('promptInput'),send:$('sendBtn'),stop:$('stopBtn'),status:$('runStatus'),step:$('stepStatus')};
let settings=createSettings(),catalog=[];
let isRunning=false,runId=null,lockedTab=null,currentOrigin='',theme='dark',replayTimer=null;
const fixedTabId=Number(new URLSearchParams(location.search).get('tab'))||null;
let boundTabId=null,renderVersion=-1,activeRequest=null,pollBusy=false,lastThread=null,traceVisible=false,traceRows=[],fullAudit=null,lastMessageSignature='';
const installedManifest=chrome.runtime.getManifest?.();
const cdpAvailable=installedManifest ? installedManifest.permissions?.includes('debugger')===true : true;
const el=(tag,cls,content)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(content!==undefined)x.textContent=content;return x;};
const scroll=()=>{ui.chatView.scrollTop=ui.chatView.scrollHeight;};
async function bg(type,options={}){const r=await chrome.runtime.sendMessage({type,...options});if(!r?.ok)throw Error(r?.error||'Erro no serviço local.');return r.data;}
function message(role,text){ui.welcome.classList.add('hidden');const a=el('article','message '+role);a.append(el('span','role',role==='user'?'VOCÊ':'NAVEGAAI'),el('div','bubble',text));ui.messages.append(a);scroll();}
function event(title,detail='',error=false){
 ui.welcome.classList.add('hidden');const a=el('details','event'+(error?' error':''));a.open=!!error;
 a.append(el('summary','',title));if(detail)a.append(el('div','sub',typeof detail==='string'?detail:compact(detail,300)));
 ui.messages.append(a);scroll();
}
function setRunning(v){isRunning=v;ui.send.classList.toggle('hidden',v);ui.stop.classList.toggle('hidden',!v);ui.prompt.disabled=v;
 ui.status.textContent=v?'Trabalhando somente nesta aba':'Pronto para começar';document.querySelectorAll('.suggestion').forEach(x=>x.disabled=v);
 $('visualMode').textContent=settings.backend==='runtime'?'Runtime · janela separada':v?(settings.realInput?'CDP / cursor azul':'Cursor azul'):'Uma aba por conversa';
 $('backendDot').classList.toggle('active',v);document.querySelector('.run-state')?.classList.toggle('active',v);
 $('modelPickerBtn').disabled=v;$('permissionBtn').disabled=v;}
function status(){const provider=PROVIDERS[settings.provider];
 $('modelLabel').textContent=settings.provider==='demo'?'Demonstração':(settings.model||provider.model).split('/').at(-1);
 $('modelLabel').title=settings.model||provider.model;$('providerLabel').textContent=provider.label;
 $('connectionBtn').textContent=settings.provider==='demo'?'● Modo demonstração':settings.apiKey?.trim()?'● API configurada':'● Adicionar chave';$('connectionBtn').classList.toggle('connected',Boolean(settings.apiKey?.trim()));
 const labels={review:['Manual','◇'],auto:['Automático','✧'],skip:['Livre','⚡'],read_only:['Somente leitura','◉']};
 const [permission,mark]=labels[settings.approvalMode]||labels.review;
 $('permissionLabel').textContent=permission;$('permissionIcon').textContent=mark;}
function showNotice(msg){$('noticeText').textContent=String(msg).slice(0,320);$('noticeBar').classList.remove('hidden');}
function inform(msg,error=false){$('saveStatus').textContent=msg;$('saveStatus').style.color=error?'var(--error)':'var(--success)';}
async function activeTab(){const tabs=await chrome.tabs.query({active:true,currentWindow:true});return tabs[0];}
async function refreshTabLabel(){if(settings.backend==='runtime'){$('lockedTab').textContent='Navegador gerenciado · perfil próprio';return null;}const tab=await activeTab();$('lockedTab').textContent=isRunning&&lockedTab?`Aba ${lockedTab.id} · ${lockedTab.title||lockedTab.url}`:tab?.id?`Aba atual · ${tab.title||tab.url}`:'Nenhuma aba';return tab;}
async function loadSettings(){const [local,session]=await Promise.all([chrome.storage.local.get(['settings','savedKey']),chrome.storage.session.get(['apiKey','bridgeToken','runtimeToken'])]);
 settings=normalizeSettings(local.settings||{});if(!cdpAvailable)settings.realInput=false;settings.apiKey=session.apiKey||local.savedKey||'';settings.bridgeToken=session.bridgeToken||'';settings.runtimeToken=session.runtimeToken||'';
 theme=local.settings?.theme==='light'?'light':'dark';document.body.dataset.theme=theme;status();refreshTabLabel().catch(()=>{});}
function toggleFields(){const provider=$('provider').value;refreshKeyUi();$('apiFields').classList.toggle('hidden',provider==='demo');$('catalogFields').classList.toggle('hidden',provider!=='openrouter');
 $('neoFields').classList.toggle('hidden',$('backend').value!=='neo');$('runtimeFields').classList.toggle('hidden',$('backend').value!=='runtime');$('bridgeFields').classList.toggle('hidden',$('neoTransport').value!=='bridge');}
function renderSettings(){for(const id of ['backend','neoTransport','provider'])$(id).value=settings[id];
 $('runtimeUrl').value=settings.runtimeUrl||'http://127.0.0.1:8765/';$('runtimeOrigins').value=settings.runtimeOrigins||'';$('runtimeToken').value=settings.runtimeToken||'';$('neoUrl').value=settings.neoUrl;$('bridgeToken').value=settings.bridgeToken||'';$('model').value=settings.model||PROVIDERS[settings.provider].model;
 $('baseURL').value=settings.baseURL||PROVIDERS[settings.provider].base;$('apiKey').value=settings.apiKey||'';$('rememberKey').checked=settings.rememberKey;
 $('approvalMode').value=settings.approvalMode;$('streamResponses').checked=settings.streamResponses!==false;$('visionEnabled').checked=!!settings.visionEnabled;$('realInput').checked=!!settings.realInput&&cdpAvailable;$('realInput').disabled=!cdpAvailable;
 $('cdpAvailability').textContent=cdpAvailable?'Edição Advanced: o Chrome solicita acesso amplo de depuração na instalação.':'Edição Standard: sem permissão de depuração. Para utilizar CDP, instale separadamente a edição Advanced.';
 $('cdpAcknowledged').checked=!!settings.realInput;
 $('cdpDisclosure').classList.toggle('hidden',!settings.realInput);$('maxSteps').value=settings.maxSteps;$('maxStepsLabel').textContent=settings.maxSteps;
 toggleFields();inform('');$('neoTestStatus').textContent='';renderCatalog();renderSitePermissions().catch(()=>{});}
function readForm(){const provider=$('provider').value,baseURL=$('baseURL').value.trim();if(provider!=='demo')validateApiBase(baseURL||PROVIDERS[provider].base);
 if($('realInput').checked && !cdpAvailable)throw Error('Esta edição não inclui a permissão debugger.');
 if($('realInput').checked && !$('cdpAcknowledged').checked)throw Error('Confirme que compreende os riscos do CDP antes de ativar.');
 return normalizeSettings({provider,backend:$('backend').value,runtimeUrl:$('runtimeUrl').value.trim(),runtimeOrigins:$('runtimeOrigins').value.trim(),runtimeToken:$('runtimeToken').value.trim(),neoUrl:validateMcpUrl($('neoUrl').value.trim()),neoTransport:$('neoTransport').value,
  bridgeToken:$('bridgeToken').value.trim(),baseURL,model:$('model').value.trim(),apiKey:$('apiKey').value.trim(),rememberKey:$('rememberKey').checked,
  approvalMode:$('approvalMode').value,realInput:$('realInput').checked,maxSteps:Number($('maxSteps').value),streamResponses:$('streamResponses').checked,visionEnabled:$('visionEnabled').checked,showTechnicalEvents:$('chatDebugEvents').checked});}
async function saveSettings(){try{if(isRunning)throw Error('Interrompa a execução para alterar configurações.');const next=readForm();
 if(next.approvalMode==='skip'&&settings.approvalMode!=='skip'&&!window.confirm('Modo Livre: a IA poderá clicar, navegar, preencher e enviar sem pedir aprovação. Isso pode causar ações indesejadas. Ativar mesmo assim?'))throw Error('Modo Livre não ativado.');
 if(next.backend==='runtime'&&!window.confirm('O Runtime abre uma janela separada do Chrome, com perfil e logins próprios. Continuar?'))throw Error('Runtime não ativado.');
 const {apiKey,bridgeToken,runtimeToken,...safe}=next;safe.theme=theme;await chrome.storage.local.set({settings:safe});await chrome.storage.session.set({bridgeToken,runtimeToken});
 if(next.rememberKey){await chrome.storage.local.set({savedKey:apiKey});await chrome.storage.session.remove('apiKey');}
 else {await chrome.storage.local.remove('savedKey');await chrome.storage.session.set({apiKey});}
 settings=next;status();inform('Configurações salvas.');await bg('AUDIT',{entry:{event:'settings_saved',provider:next.provider,model:next.model,approvalMode:next.approvalMode}}).catch(()=>{});
 setTimeout(()=>{$('settingsView').classList.add('hidden');},420);
 }catch(e){inform(scrubError(e),true);}}
function renderCatalog(){if(!$('modelSelect'))return;const select=$('modelSelect');const models=searchModels(catalog,$('modelSearch').value,$('toolsOnly').checked);const prior=$('model').value;
 select.replaceChildren(el('option','',`Todos os modelos · ${models.length} encontrados`));select.firstChild.value='';
 for(const m of models.slice(0,700)){const option=el('option','',m.name+' · '+m.id+(m.tools?' · 🛠':' · chat'));option.value=m.id;select.append(option);}
 if(models.some(x=>x.id===prior))select.value=prior;
 const selected=catalog.find(x=>x.id===prior);
 $('modelInfo').textContent=selected?`${selected.tools?'Suporta ferramentas':'Sem ferramentas declaradas — automação pode falhar'} · Contexto ${selected.context||'—'} tokens · prompt ${selected.promptPrice}/token · completion ${selected.completionPrice}/token`:
 `${catalog.length} modelos disponíveis, incluindo modelos sem ferramentas. A pesquisa filtra o catálogo local; ${Math.min(700,models.length)} são mostrados por vez.`;
}
async function syncModels(force=false){try{$('catalogStatus').textContent='Sincronizando...';const result=await bg('MODELS',{force});catalog=result.models||[];
 $('catalogStatus').textContent=`${catalog.length} modelos · ${result.stale?'cache antigo':new Date(result.updatedAt).toLocaleString('pt-BR')}`;renderCatalog();renderQuickModels();}
 catch(e){$('catalogStatus').textContent='Falha: '+scrubError(e);}}
async function renderSitePermissions(){
 const sites=await bg('SITE_LIST');const host=$('sitePermissionsList');host.replaceChildren();
 const entries=Object.entries(sites).sort(([a],[b])=>a.localeCompare(b));
 if(!entries.length){host.append(el('p','hint','Nenhum site autorizado permanentemente. Os sites serão consultados quando você iniciar uma tarefa.'));return;}
 for(const [origin,mode] of entries){
  const box=el('div','site-entry');const details=el('span','site-detail');details.append(el('b','',origin),el('small','',mode==='allow'?'Permitido':'Bloqueado'));
  const revoke=el('button','btn ghost','Revogar');revoke.setAttribute('aria-label','Revogar acesso de '+origin);
  revoke.addEventListener('click',async()=>{await bg('SITE_SET',{origin,mode:'ask'});await renderSitePermissions();});box.append(details,revoke);host.append(box);
 }
}


function refreshKeyUi(){
 const provider=$('provider')?.value||settings.provider;
 $('apiKeyLabel').textContent=provider==='openrouter'?'Chave de API do OpenRouter':`Chave de API · ${PROVIDERS[provider]?.label||'Provedor'}`;
 $('apiKey').placeholder=provider==='openrouter'?'Cole aqui sua chave sk-or-v1-...':'Cole a chave da API aqui';
 const ready=!!$('apiKey').value.trim();$('keyStatus').textContent=ready?'● Chave preenchida · salve para aplicar':'● Chave ainda não preenchida';$('keyStatus').classList.toggle('is-ready',ready);
}
function updateActivity(thread){
 const events=(thread.messages||[]).filter(x=>x.role==='event').map(x=>x.event);
 const last=events.at(-1);const errors=events.filter(x=>x.type==='tool_error'||x.type==='verification_failed'||x.type==='observation'&&!x.ok).length;
 const terms={thinking:'Analisando a próxima ação',tool_start:'Executando',tool_success:'Executou',tool_error:'Falhou',observation:'Verificou estado da página',policy:'Validou permissão',approval:'Decisão registrada',duration:'Duração medida'};
 const label=last?`${terms[last.type]||last.type}${last.name?' · '+last.name:''}${last.type==='tool_error'?' · erro':''}`:'Nenhuma ação registrada';
 $('liveActivity').textContent=thread.status==='needs_review'?'⚠ Execução não verificada · consulte o histórico':(errors?'⚠ '+errors+' falha(s) · ':'')+label;
 $('traceBtn').title=`Ver atividade · ${events.length} eventos`;
}
const traceNames={thinking:'Planejamento',model_start:'Solicitação à IA',model_done:'Resposta do modelo',recovery_attempt:'Tentando recuperar elemento',recovery_success:'Elemento relocalizado',recovery_stopped:'Recuperação interrompida',context_compacted:'Contexto otimizado',verification_failed:'Verificação não confirmou resultado',tool_start:'Início da ferramenta',tool_success:'Ferramenta executada',tool_error:'Falha da ferramenta',observation:'Leitura de verificação',policy:'Política e risco',approval:'Aprovação',duration:'Duração da etapa',usage:'Tokens',site_access:'Acesso a site'};
function traceEntries(thread){
 return (thread.messages||[]).filter(x=>x.role==='user'||x.role==='event'||x.role==='error').map(x=>{
  if(x.role==='user')return {type:'user_request',at:x.at,detail:x.text,title:'Pedido do usuário'};
  if(x.role==='error')return {type:'failure',at:x.at,detail:x.text,title:'Falha na execução'};
  const e=x.event;return {type:e.type,at:e.at,name:e.name,step:e.step,ms:e.ms,risk:e.risk,decision:e.decision,ok:e.ok,
    title:traceNames[e.type]||e.type,detail:e.error||e.reason||e.decision||e.text||(e.args?JSON.stringify(e.args):'')||(e.result?JSON.stringify(e.result):''),runId:e.runId};
 });
}
function traceClass(e){return ['failure','tool_error','agent_tool_error','agent_verification_failed','verification_failed'].includes(e.type)||e.type==='observation'&&e.ok===false?'is-error':['tool_success','approval','agent_tool_success'].includes(e.type)?'is-good':'';}
function renderTrace(thread){
 const tail=traceEntries(thread);const rows=Array.isArray(fullAudit)&&fullAudit.length?[...fullAudit,...tail.filter(x=>x.at>Math.max(...fullAudit.map(e=>e.at||0)))]:tail;traceRows=rows;
 $('traceSource').textContent=Array.isArray(fullAudit)&&fullAudit.length?'Auditoria persistente da aba':'Histórico da conversa';
 const f=$('traceFilter').value;const filtered=rows.filter(e=>f==='all'||f==='errors'&&traceClass(e)==='is-error'||f==='decisions'&&['policy','approval','site_access','approval_requested','approval_decided','site_auto_scoped','agent_policy','agent_approval'].includes(e.type)||f==='tools'&&['tool_start','tool_success','tool_error','observation','duration','agent_tool_start','agent_tool_success','agent_tool_error','agent_observation','agent_duration','agent_recovery_attempt','agent_recovery_success','agent_recovery_stopped'].includes(e.type));
 $('traceTotal').textContent=String(rows.length);$('traceFails').textContent=String(rows.filter(e=>traceClass(e)==='is-error').length);
 const times=rows.map(x=>x.at).filter(Boolean);$('traceTime').textContent=times.length>1?`${Math.max(0,Math.round((times.at(-1)-times[0])/1000))} s`:'—';
 $('traceSubtitle').textContent=`Aba ${thread.tabId} · ${thread.status||'pronta'}`;
 const host=$('traceList');const fragment=document.createDocumentFragment();
 if(!filtered.length)fragment.append(el('p','hint','Nenhum registro deste filtro nesta conversa.'));
 for(const e of filtered){
  const box=el('article','trace-event '+traceClass(e));const heading=el('div','trace-heading');
  heading.append(el('b','',e.title+(e.name?' · '+e.name:'')),el('time','',e.at?new Date(e.at).toLocaleTimeString('pt-BR'):'—'));box.append(heading);
  if(e.detail)box.append(el('p','trace-detail',String(e.detail).slice(0,1500)));
  const tags=el('div','trace-tags');for(const [k,v] of [['Etapa',e.step],['Risco',e.risk],['Duração',e.ms===undefined?'':e.ms+' ms']])if(v!==undefined&&v!==null&&v!=='')tags.append(el('span','',`${k}: ${v}`));if(tags.children.length)box.append(tags);
  fragment.append(box);
 }
 host.replaceChildren(fragment);
}
async function openTrace(){closeModelPicker();closePermissionPicker();$('settingsView').classList.add('hidden');$('toolsView').classList.add('hidden');traceVisible=true;$('traceView').classList.remove('hidden');if(lastThread)renderTrace(lastThread);await loadFullTrace();}
function closeTrace(){if(replayTimer){clearInterval(replayTimer);replayTimer=null;}$('traceReplayBtn').textContent='▶ Replay';traceVisible=false;fullAudit=null;$('traceView').classList.add('hidden');}
function replayTrace(){if(replayTimer){clearInterval(replayTimer);replayTimer=null;$('traceReplayBtn').textContent='▶ Replay';return;}
 const items=[...$('traceList').querySelectorAll('.trace-event')];if(!items.length)return;let index=0;$('traceReplayBtn').textContent='■ Parar';
 replayTimer=setInterval(()=>{for(const x of items)x.classList.remove('replay-active');
 if(index>=items.length){clearInterval(replayTimer);replayTimer=null;$('traceReplayBtn').textContent='▶ Replay';return;}
 items[index].classList.add('replay-active');items[index].scrollIntoView({block:'nearest',behavior:'smooth'});index++;},650);
}
async function exportConversationTrace(){
 if(!lastThread)return;const rows=fullAudit||traceEntries(lastThread);const data={exportedAt:new Date().toISOString(),tabId:lastThread.tabId,threadId:lastThread.threadId,
  status:lastThread.status,runId:lastThread.runId,events:rows};download(JSON.stringify(data,null,2),`navegaai-conversa-${lastThread.tabId}-${Date.now()}.json`);
}
function safeAuditEvent(log){
 const names={run_requested:'Pedido registrado',run_started:'Início da execução',run_finished:'Encerramento',approval_requested:'Aprovação solicitada',approval_decided:'Decisão de aprovação',site_auto_scoped:'Autorização por modo',run_cancel_requested:'Interrupção',agent_model_start:'Consulta ao modelo',agent_model_done:'Modelo respondeu',agent_tool_start:'Ferramenta iniciada',agent_tool_success:'Ferramenta executada',agent_tool_error:'Falha de ferramenta',agent_observation:'Leitura pós-ação',agent_recovery_attempt:'Iniciou autorrecuperação',agent_recovery_success:'Autorrecuperação bem-sucedida',agent_recovery_stopped:'Limite de recuperação',agent_context_compacted:'Contexto otimizado',agent_verification_failed:'Resultado não confirmado',agent_policy:'Política aplicada',agent_duration:'Duração da ação',agent_usage:'Consumo informado pela API'};
 const title=names[log.event]||String(log.event||'Evento').replaceAll('_',' ');
 const detail=log.requestPreview||log.error||log.reason||log.decision|| (log.operation&&typeof log.operation==='object'?JSON.stringify(log.operation):'')|| (log.outcome&&typeof log.outcome==='object'?JSON.stringify(log.outcome):'')||log.outcome||'';
 return {type:log.event,at:Date.parse(log.at),name:log.name||log.tool||'',ms:log.ms,step:log.step,risk:log.risk,title,detail:String(detail).slice(0,1500)};
}
async function loadFullTrace(){
 if(!boundTabId||!traceVisible)return;
 try{const items=await bg('AUDIT_QUERY',{tabId:boundTabId});fullAudit=items.map(safeAuditEvent);if(lastThread)renderTrace(lastThread);}
 catch(e){$('traceSource').textContent='Histórico local · '+scrubError(e);}
}
async function sendUserMessage(raw){
 const msg=String(raw||'').trim();if(!msg||isRunning)return;
 try{
  if(!boundTabId){const tab=await activeTab();boundTabId=tab?.id;}
  if(!boundTabId)throw Error('Nenhuma aba de trabalho disponível.');
  $('settingsView').classList.add('hidden');$('toolsView').classList.add('hidden');closeTrace();
  await bg('CHAT_START',{tabId:boundTabId,userMessage:msg});
  ui.prompt.value='';renderVersion=-1;await pollThread();
 }catch(e){showNotice('Não foi possível iniciar: '+scrubError(e));}
}
async function stop(){if(boundTabId)await bg('CHAT_STOP',{tabId:boundTabId}).catch(e=>showNotice('Não foi possível interromper: '+scrubError(e)));}
async function newChat(){
 try{
  // Each conversation gets its own tab and tab-specific panel (Chrome 116+).
  const {tabId}=await bg('CHAT_NEW');
  boundTabId=tabId;fullAudit=null;renderVersion=-1;lastMessageSignature='';runId=null;lockedTab=null;
  await chrome.sidePanel.open({tabId}).catch(()=>{});
  $('conversationsView').classList.add('hidden');await pollThread();
 }catch(e){showNotice('Não foi possível criar conversa: '+scrubError(e));}
}
function showThread(thread){
 ui.messages.replaceChildren();ui.welcome.classList.toggle('hidden',Boolean(thread.messages?.length));
 const visible=(thread.messages||[]).filter(x=>x.role!=='event'||settings.showTechnicalEvents);
 for(const entry of visible){
  if(entry.role==='user'||entry.role==='agent'){
   message(entry.role,entry.text);
  }else if(entry.role==='error'){
   // Technical errors belong in the timeline, not mixed with ordinary replies.
   message('agent','Não consegui concluir a tarefa. Abra “Ver atividade” para consultar o erro e o ponto da falha.');
   if(settings.showTechnicalEvents)event('Falha técnica',entry.text,true);
  }else if(entry.role==='event'&&settings.showTechnicalEvents){
   const e=entry.event;event((traceNames[e.type]||e.type)+(e.name?' · '+e.name:''),e.error||e.reason||(e.args?JSON.stringify(e.args):''),e.type==='tool_error'||e.type==='verification_failed');
  }
 }
}
async function decide(kind,decision){
 if(!activeRequest||!boundTabId)return;
 try{
  await bg('CHAT_DECIDE',{tabId:boundTabId,runId:activeRequest.runId,requestId:activeRequest.requestId,decision});
  activeRequest=null;await pollThread();
 }catch(e){event('Decisão não aplicada',scrubError(e),true);}
}
function displayApproval(req){
 activeRequest=req||null;
 $('approval').classList.add('hidden');$('siteApproval').classList.add('hidden');$('cdpRunApproval').classList.add('hidden');
 if(!req)return;
 if(req.kind==='site'){
  $('siteApprovalDetail').textContent=req.origin+'\n'+req.detail;
  $('siteApproval').classList.remove('hidden');
 }else if(req.kind==='cdp'){$('cdpRunApproval').classList.remove('hidden');}
 else{$('approvalDetail').textContent=(req.label||req.name)+'\n'+(req.detail||'');$('approval').classList.remove('hidden');}
}
async function pollThread(){
 if(pollBusy||!boundTabId)return;
 pollBusy=true;
 try{
  const thread=await bg('CHAT_STATUS',{tabId:boundTabId});
  lastThread=thread;
  if(thread.version!==renderVersion){renderVersion=thread.version;showThread(thread);updateActivity(thread);if(traceVisible)renderTrace(thread);}
  $('streamPreview').textContent=thread.draft||'';$('streamPreview').classList.toggle('hidden',!thread.draft);
  $('activityRibbon').classList.toggle('hidden',!['starting','running','approval','error','needs_review'].includes(thread.status));
  displayApproval(thread.approval);
  runId=thread.runId||null;
  const running=['starting','running','approval'].includes(thread.status);
  if(running!==isRunning)setRunning(running);
  ui.status.textContent=thread.status==='approval'?'Aguardando aprovação':thread.status==='running'?(thread.backend==='runtime'?'Agente trabalhando no navegador gerenciado':'Agente trabalhando nesta aba'):
   thread.status==='starting'?'Preparando execução...':thread.status==='completed'?'Tarefa concluída':thread.status==='needs_review'?'Concluída com ressalvas · ver atividade':thread.status==='error'?'Execução falhou':
   thread.status==='cancelled'?'Execução interrompida':'Pronto para começar';
  ui.step.textContent=running?'Execução '+String(runId||'').slice(0,8):(thread.backend==='runtime'?'Navegador gerenciado separado':'Conversa vinculada à aba');
  const tab=(thread.tabLabel&&thread.tabId===boundTabId)?{id:boundTabId,title:thread.tabLabel,url:thread.tabUrl}:await chrome.tabs.get(boundTabId).catch(()=>null);
  lockedTab=tab;
  $('lockedTab').textContent=thread.backend==='runtime'?'Runtime local · perfil de navegador separado':(tab?`${(tab.title||tab.url||'').slice(0,55)}`:`Aba ${boundTabId} fechada · conversa preservada`);
 }catch(e){if(!String(e.message||e).includes('context invalidated'))console.warn('Atualização de conversa falhou:',e);}
 finally{pollBusy=false;}
}
function download(text,name,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type}));const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);}
async function exportAudit(){try{const rows=await bg('AUDIT_LIST');download(rows.map(x=>JSON.stringify(x)).join('\n'),`navegaai-audit-${Date.now()}.jsonl`,'application/x-ndjson');}
 catch(e){event('Exportação falhou',scrubError(e),true);}}
function renderQuickModels(){
 const host=$('quickModelList');if(!host)return;host.replaceChildren();
 const query=$('quickModelSearch').value.trim().toLowerCase();
 const localMatch=!query||'demonstração local sem chave'.includes(query);
 if(localMatch){const b=el('button','model-result'+(settings.provider==='demo'?' selected':''));
  b.append(el('span','result-symbol','✳'));
  const name=el('span','result-label');name.append(el('b','','Demonstração local'),el('small','','Sem chave · operações de teste'));b.append(name);
  b.addEventListener('click',()=>chooseQuickModel('demo',''));host.append(b);}
 const matches=searchModels(catalog,query,false);
 $('quickModelStatus').textContent=catalog.length?`${matches.length} de ${catalog.length} modelos do OpenRouter${matches.length>80?' · refine a busca':''}`:'Catálogo indisponível. Clique em atualizar.';
 for(const model of matches.slice(0,80)){
  const selected=settings.provider==='openrouter'&&settings.model===model.id;
  const b=el('button','model-result'+(selected?' selected':''));b.setAttribute('role','option');b.setAttribute('aria-selected',String(selected));
  b.title=model.id;b.append(el('span','result-symbol',model.tools?'✧':'◇'));
  const name=el('span','result-label');name.append(el('b','',model.name),el('small','',`${model.id} · ${model.tools?'Ferramentas':'Chat'} · ${model.context?Math.round(model.context/1000)+'k contexto':'Contexto n/d'}`));b.append(name);
  if(selected)b.append(el('span','selected-mark','✓'));
  b.addEventListener('click',()=>chooseQuickModel('openrouter',model.id));host.append(b);
 }
}
function closeModelPicker(){const picker=$('modelPopover');picker.classList.add('hidden');$('modelPickerBtn').setAttribute('aria-expanded','false');}
function closePermissionPicker(){$('permissionPopover').classList.add('hidden');}
function renderPermissionPicker(){document.querySelectorAll('[data-quick-mode]').forEach(el=>{
 const selected=el.dataset.quickMode===settings.approvalMode;el.classList.toggle('selected',selected);el.setAttribute('aria-pressed',String(selected));
});}
async function selectPermission(mode){
 if(isRunning||!['review','auto','skip','read_only'].includes(mode))return;
 if(mode==='skip'&&settings.approvalMode!=='skip'&&!window.confirm('ATENÇÃO: modo Livre pula aprovações normais, inclusive cliques e envios. Confirma a ativação?'))return;
 settings.approvalMode=mode;
 const {apiKey,bridgeToken,runtimeToken,...safe}=settings;safe.theme=theme;
 await chrome.storage.local.set({settings:safe});status();closePermissionPicker();
 await bg('AUDIT',{entry:{event:'approval_mode_changed',mode}}).catch(()=>{});
}
async function chooseQuickModel(provider,model){
 if(isRunning)return;
 const changedProvider=settings.provider!==provider;
 if(changedProvider){settings.apiKey='';settings.rememberKey=false;await Promise.all([chrome.storage.local.remove('savedKey'),chrome.storage.session.remove('apiKey')]);}
 settings.provider=provider;settings.model=model||PROVIDERS[provider].model;settings.baseURL=PROVIDERS[provider].base;
 const {apiKey,bridgeToken,runtimeToken,...persist}=settings;persist.theme=theme;
 await chrome.storage.local.set({settings:persist});closeModelPicker();status();
 if(changedProvider&&provider!=='demo'){renderSettings();$('settingsView').classList.remove('hidden');inform('Modelo escolhido. Cole sua chave do OpenRouter no campo identificado.');}
}
function providerChanged(){const provider=$('provider').value;$('model').value=PROVIDERS[provider].model;$('baseURL').value=PROVIDERS[provider].base;
 $('apiKey').value='';$('rememberKey').checked=false;toggleFields();if(provider==='openrouter')syncModels().catch(()=>{});}
async function renderMemories(origin){currentOrigin=origin;$('memoryDomain').textContent=origin||'Abra uma aba web válida.';const items=$('memoryList');items.replaceChildren();
 if(!origin)return;const memories=await bg('MEMORY_LIST',{origin});if(!memories.length)items.append(el('p','hint','Nenhuma memória salva neste site.'));
 for(const m of memories){const row=el('div','item',m.text);row.append(el('small','',new Date(m.at).toLocaleString('pt-BR')));
 const b=el('button','btn ghost','Excluir');b.addEventListener('click',async()=>{await bg('MEMORY_REMOVE',{origin,id:m.id});renderMemories(origin);});row.append(b);items.append(row);}}
async function renderJobs(){const list=$('cronList');list.replaceChildren();const jobs=await bg('JOBS');if(!jobs.length)list.append(el('p','hint','Nenhuma tarefa agendada.'));
 for(const job of jobs){const row=el('div','item',`${job.cron} · Aba ${job.tabId}\n${job.prompt}`);row.append(el('small','',`Origem: ${job.origin}\nÚltima execução: ${job.lastRun||'nunca'}\n${job.lastError?'Erro: '+job.lastError:'Resultado: '+(job.lastResult||'—')}`));
 const b=el('button','btn ghost','Remover tarefa');b.addEventListener('click',async()=>{await bg('JOB_REMOVE',{id:job.id});renderJobs();});row.append(b);list.append(row);}}
async function renderSkills(origin){
 const host=$('skillsList');host.replaceChildren();const rows=await bg('SKILLS_LIST',{origin});
 if(!rows.length)host.append(el('p','hint','Nenhuma habilidade sugerida neste site. Execute uma tarefa e confirme seu resultado primeiro.'));
 for(const skill of rows){const row=el('div','item');row.append(el('b','',skill.title),el('small','',skill.status==='approved'?'Aprovada para reutilizar · prova: '+skill.verifiedProofs:'Sugestão não aprovada · prova: '+skill.verifiedProofs));
  const actions=el('div','inline');
  if(skill.status!=='approved'){const a=el('button','btn secondary','Aprovar');a.addEventListener('click',async()=>{await bg('SKILLS_APPROVE',{id:skill.id});renderSkills(origin);});actions.append(a);}
  if(skill.status==='approved'){const use=el('button','btn secondary','Usar');use.addEventListener('click',()=>{$('toolsView').classList.add('hidden');ui.prompt.value=skill.instruction;ui.prompt.focus();});actions.append(use);}
  const remove=el('button','btn ghost','Excluir');remove.addEventListener('click',async()=>{await bg('SKILLS_REMOVE',{id:skill.id});renderSkills(origin);});actions.append(remove);row.append(actions);host.append(row);
 }
}
async function openTools(){if(isRunning)return;const tab=await chrome.tabs.get(boundTabId||0).catch(()=>activeTab());const origin=siteOrigin(tab?.url||'');$('toolsView').classList.remove('hidden');
 await Promise.all([renderMemories(origin),renderJobs(),renderSkills(origin)]).catch(e=>{$('auditStatus').textContent=scrubError(e);});}
$('dismissNotice').addEventListener('click',()=>$('noticeBar').classList.add('hidden'));
$('settingsBtn').addEventListener('click',()=>{if(isRunning)return;closeModelPicker();renderSettings();$('settingsView').classList.remove('hidden');});
$('permissionBtn').addEventListener('click',()=>{if(isRunning)return;closeModelPicker();renderPermissionPicker();$('permissionPopover').classList.toggle('hidden');});
for(const button of document.querySelectorAll('[data-quick-mode]'))button.addEventListener('click',()=>selectPermission(button.dataset.quickMode));
$('manageSitePermsBtn').addEventListener('click',()=>{closePermissionPicker();renderSettings();$('settingsView').classList.remove('hidden');$('sitePermissionsList').scrollIntoView({block:'center'});});
$('modelPickerBtn').addEventListener('click',()=>{if(isRunning)return;closePermissionPicker();const hidden=$('modelPopover').classList.toggle('hidden');$('modelPickerBtn').setAttribute('aria-expanded',String(!hidden));if(!hidden){renderQuickModels();$('quickModelSearch').focus();}});
$('closeModelPicker').addEventListener('click',closeModelPicker);
$('quickModelSearch').addEventListener('input',renderQuickModels);
$('quickModelSync').addEventListener('click',()=>syncModels(true));
$('quickModelSettings').addEventListener('click',()=>{closeModelPicker();renderSettings();$('settingsView').classList.remove('hidden');});
$('themeBtn').addEventListener('click',async()=>{theme=theme==='dark'?'light':'dark';document.body.dataset.theme=theme;const stored=await chrome.storage.local.get('settings');await chrome.storage.local.set({settings:{...stored.settings,theme}});});
$('realInput').addEventListener('change',()=>{const on=$('realInput').checked;$('cdpDisclosure').classList.toggle('hidden',!on);if(on&&!settings.realInput)$('cdpAcknowledged').checked=false;});
for(const [button,mode] of [['allowCurrentSiteBtn','allow'],['blockCurrentSiteBtn','block']]){
 $(button).addEventListener('click',async()=>{
  try{const tab=await activeTab();const origin=siteOrigin(tab?.url||'');if(!origin)throw Error('Abra um site HTTP(S) primeiro.');
   await bg('SITE_SET',{origin,mode});await renderSitePermissions();
   $('sitePermissionsStatus').textContent=mode==='allow'?`Acesso permitido em ${origin}.`:`Acesso bloqueado em ${origin}.`;
  }catch(e){$('sitePermissionsStatus').textContent=scrubError(e);}
 });
}
$('siteDenyBtn').addEventListener('click',()=>decide('site','deny'));
$('siteOnceBtn').addEventListener('click',()=>decide('site','once'));
$('siteAlwaysBtn').addEventListener('click',()=>decide('site','always'));
$('cdpDenyBtn').addEventListener('click',()=>decide('cdp','deny'));
$('cdpAllowBtn').addEventListener('click',()=>decide('cdp','yes'));

$('backBtn').addEventListener('click',()=>$('settingsView').classList.add('hidden'));
$('toolsBtn').addEventListener('click',openTools);
$('traceBtn').addEventListener('click',openTrace);$('openTraceBtn').addEventListener('click',openTrace);$('toolsTraceBtn').addEventListener('click',openTrace);$('traceBackBtn').addEventListener('click',closeTrace);$('traceRefreshBtn').addEventListener('click',loadFullTrace);$('traceFilter').addEventListener('change',()=>lastThread&&renderTrace(lastThread));$('traceExportBtn').addEventListener('click',exportConversationTrace);$('traceReplayBtn').addEventListener('click',replayTrace);$('traceGlobalExportBtn').addEventListener('click',exportAudit);
$('connectionBtn').addEventListener('click',()=>{renderSettings();$('settingsView').classList.remove('hidden');$('apiKey').focus();});$('apiKey').addEventListener('input',refreshKeyUi);$('toggleKeyBtn').addEventListener('click',()=>{const i=$('apiKey');i.type=i.type==='password'?'text':'password';$('toggleKeyBtn').textContent=i.type==='password'?'Mostrar chave':'Ocultar chave';});
$('toolsBackBtn').addEventListener('click',()=>$('toolsView').classList.add('hidden'));
$('provider').addEventListener('change',providerChanged);
$('backend').addEventListener('change',toggleFields);
$('neoTransport').addEventListener('change',()=>{$('neoUrl').value=$('neoTransport').value==='bridge'?'http://127.0.0.1:9842/mcp':'http://127.0.0.1:9200/mcp';toggleFields();});
$('saveSettingsBtn').addEventListener('click',saveSettings);
$('maxSteps').addEventListener('input',()=>{$('maxStepsLabel').textContent=$('maxSteps').value;});
$('syncModelsBtn').addEventListener('click',()=>syncModels(true));
$('modelSearch').addEventListener('input',renderCatalog);$('toolsOnly').addEventListener('change',renderCatalog);
$('modelSelect').addEventListener('change',()=>{if($('modelSelect').value){$('model').value=$('modelSelect').value;renderCatalog();}});
$('model').addEventListener('input',renderCatalog);
$('sendBtn').addEventListener('click',()=>sendUserMessage(ui.prompt.value));$('stopBtn').addEventListener('click',stop);
$('approveBtn').addEventListener('click',()=>decide('action','yes'));$('rejectBtn').addEventListener('click',()=>decide('action','deny'));
async function openConversations(){
 closeModelPicker();closePermissionPicker();$('settingsView').classList.add('hidden');$('toolsView').classList.add('hidden');closeTrace();
 $('conversationsView').classList.remove('hidden');await renderConversations();
}
async function renderConversations(){
 const host=$('conversationsList');host.replaceChildren();
 try{const rows=await bg('CHAT_LIST');if(!rows.length)host.append(el('p','hint','Nenhuma conversa salva ainda. Crie uma nova conversa.'));
 for(const c of rows){const card=el('article','conversation-item');
  const title=el('strong','',c.title||'Nova conversa');const detail=el('small','',`${c.tabId?'Aba '+c.tabId+' · ':'Arquivada · '}${c.status||'pronta'} · ${new Date(c.updatedAt).toLocaleString('pt-BR')}`);
  const url=el('span','conversation-url',c.lastUrl||'Sem site salvo');const info=el('div','conversation-info');info.append(title,detail,url);
  const button=el('button','btn secondary',c.tabId?'Ir à aba':'Reabrir');button.addEventListener('click',async()=>{
    button.disabled=true;try{const result=await bg('CHAT_REOPEN',{conversationId:c.id});
      boundTabId=result.tabId;await chrome.sidePanel.open({tabId:boundTabId}).catch(()=>{});
      $('conversationsView').classList.add('hidden');renderVersion=-1;fullAudit=null;await pollThread();
    }catch(e){showNotice(scrubError(e));}finally{button.disabled=false;}
  });card.append(info,button);host.append(card);
 }}catch(e){host.append(el('p','hint','Não foi possível carregar as conversas: '+scrubError(e)));}
}
$('conversationsBtn').addEventListener('click',openConversations);
$('conversationsBackBtn').addEventListener('click',()=>$('conversationsView').classList.add('hidden'));
$('conversationsRefreshBtn').addEventListener('click',renderConversations);
$('conversationsNewBtn').addEventListener('click',newChat);
$('newChatBtn').addEventListener('click',newChat);$('historyBtn').addEventListener('click',exportAudit);
ui.prompt.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendUserMessage(ui.prompt.value);}});
document.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>sendUserMessage(b.dataset.prompt)));
$('testNeoBtn').addEventListener('click',()=>{$('neoTestStatus').textContent='Conexão neo está indisponível no modo aba isolada; não é executada.';});
$('memoryAddBtn').addEventListener('click',async()=>{try{await bg('MEMORY_ADD',{origin:currentOrigin,text:$('memoryInput').value});$('memoryInput').value='';await renderMemories(currentOrigin);}catch(e){$('memoryDomain').textContent=scrubError(e);}});
$('cronAddBtn').addEventListener('click',async()=>{try{
 const tab=await activeTab();if(!tab?.id)throw Error('Abra uma aba web primeiro.');if(settings.provider==='demo')throw Error('Configure uma API para o cron.');
 if(!settings.rememberKey)throw Error('O cron sem painel exige que você marque Lembrar chave nas configurações.');
 const origin=siteOrigin(tab.url);await bg('JOB_ADD',{job:{tabId:tab.id,origin,prompt:$('cronPrompt').value,cron:$('cronExpr').value,backend:'chrome'}});
 $('cronPrompt').value='';await renderJobs();}catch(e){$('auditStatus').textContent=scrubError(e);}});
$('auditExportBtn').addEventListener('click',exportAudit);
$('auditVerifyBtn').addEventListener('click',async()=>{try{const logs=await bg('AUDIT_LIST');$('auditStatus').textContent=await verifyAudit(logs)?`✓ ${logs.length} registros com integridade de hashes verificada`:'✕ Cadeia de logs inválida';}
 catch(e){$('auditStatus').textContent=scrubError(e);}});
// Tasks belong to the background engine. Hiding the panel does not intentionally cancel a run.
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModelPicker();closePermissionPicker();}});
loadSettings().then(async()=>{boundTabId=fixedTabId||(await activeTab())?.id||null;await pollThread();setInterval(()=>{if(document.visibilityState==='visible'||isRunning)pollThread();},2500);
 chrome.tabs.onActivated.addListener(async({tabId})=>{if(fixedTabId)return;boundTabId=tabId;fullAudit=null;renderVersion=-1;lastMessageSignature='';await pollThread();if(traceVisible)await loadFullTrace();});
 chrome.storage.onChanged?.addListener((changes,area)=>{if(area==='local'&&boundTabId&&changes['navegaThreadV1:'+boundTabId])pollThread().catch(()=>{});});
 syncModels().catch(()=>{});}).catch(e=>showNotice('Falha na inicialização: '+scrubError(e)));
