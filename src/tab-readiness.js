// Resolve newly created browser tabs before executing an agent. A pending
// Chrome navigation is not a failure and a harmless New Tab may be initialized
// in-place. Never navigate away from Chrome settings, extension pages, local
// files, or other already populated tabs to bypass browser protections.
const INITIAL_WORK_URL = 'https://www.google.com/';

export function isWebTabUrl(value) {
  try {
    const url=new URL(String(value||''));
    return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password;
  } catch { return false; }
}

export function isEmptyNewTabUrl(value) {
  const url=String(value||'').trim().toLowerCase();
  return !url || url==='about:blank' || url==='about:newtab' || /^chrome:\/\/newtab\/?(?:[?#].*)?$/.test(url);
}

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitForWebLoad(browserApi,tabId,tab,until,intervalMs) {
  // A URL can appear in tabs.get before Chromium finishes creating its document.
  while(tab.status==='loading' && Date.now()<until){
    await pause(intervalMs);
    try{tab=await browserApi.tabs.get(tabId);}catch{throw Error('A aba foi fechada durante o carregamento.');}
    if(!isWebTabUrl(tab.url))break;
  }
  if(isWebTabUrl(tab.url)&&tab.status!=='loading')return tab;
  if(isWebTabUrl(tab.url))throw Error('A página ainda está carregando. Aguarde e tente novamente.');
  throw Error('A aba mudou de endereço durante o carregamento. Confirme o site e tente novamente.');
}

export async function prepareConversationTab(browserApi, tabId, options={}) {
  if(!Number.isInteger(tabId)||tabId<1)throw Error('Aba da conversa inválida.');
  const timeoutMs=Math.max(200,Number(options.timeoutMs)||9000);
  const intervalMs=Math.max(10,Number(options.intervalMs)||150);
  const homeUrl=options.homeUrl||INITIAL_WORK_URL;
  if(!isWebTabUrl(homeUrl))throw Error('Página inicial de trabalho inválida.');
  let tab;
  try {tab=await browserApi.tabs.get(tabId);}catch{throw Error('A aba desta conversa foi fechada. Reabra a conversa para continuar.');}
  // In Chrome, tab.url may still describe the previous site while pendingUrl
  // points to a different destination. Wait for the committed target.
  if(isWebTabUrl(tab.pendingUrl) && tab.status==='loading' && tab.pendingUrl!==tab.url){
    const until=Date.now()+timeoutMs;
    while(Date.now()<until){
      await pause(intervalMs);
      try{tab=await browserApi.tabs.get(tabId);}catch{throw Error('A aba foi fechada durante a navegação.');}
      if(isWebTabUrl(tab.url)&&(!isWebTabUrl(tab.pendingUrl)||tab.pendingUrl===tab.url))
        return {tab:await waitForWebLoad(browserApi,tabId,tab,until,intervalMs),bootstrapped:false};
      if(tab.status==='complete'&&isWebTabUrl(tab.url))
        return {tab,bootstrapped:false};
    }
    throw Error('A aba ainda está mudando de site. Aguarde a navegação e tente novamente.');
  }
  if(isWebTabUrl(tab.url))return {tab:await waitForWebLoad(browserApi,tabId,tab,Date.now()+timeoutMs,intervalMs),bootstrapped:false};

  // When the browser has a pending HTTP(S) navigation, wait for its target.
  // Do not overwrite the user's in-flight navigation with a new homepage.
  if(isWebTabUrl(tab.pendingUrl)){
    const until=Date.now()+timeoutMs;
    do {
      await pause(intervalMs);
      try {tab=await browserApi.tabs.get(tabId);}catch{throw Error('A aba desta conversa foi fechada durante o carregamento.');}
      if(isWebTabUrl(tab.url))return {tab:await waitForWebLoad(browserApi,tabId,tab,until,intervalMs),bootstrapped:false};
    }while(Date.now()<until && isWebTabUrl(tab.pendingUrl));
    throw Error('A navegação da aba ainda não terminou. Aguarde carregar o site e tente novamente.');
  }

  if((tab.pendingUrl&&!isEmptyNewTabUrl(tab.pendingUrl))||!isEmptyNewTabUrl(tab.url)){
    throw Error('Esta é uma página protegida do navegador. Abra um site HTTP(S) ou crie uma nova conversa para usar uma aba de trabalho.');
  }
  // A fresh conversation does not need an unrelated external homepage.  Its
  // first get_page returns an explicit navigation-only snapshot, allowing the
  // model to navigate the SAME tab to the user's requested destination.
  // Keep this opt-in so other callers retain the previous bootstrap behavior.
  if(options.allowBlankNavigation===true){
    const fresh=await browserApi.tabs.get(tabId);
    if(isWebTabUrl(fresh.url))return {tab:await waitForWebLoad(browserApi,tabId,fresh,Date.now()+timeoutMs,intervalMs),bootstrapped:false,navigationOnly:false};
    if(isWebTabUrl(fresh.pendingUrl))throw Error('A aba começou a carregar um site. Aguarde a navegação.');
    if(isEmptyNewTabUrl(fresh.url)&&(!fresh.pendingUrl||isEmptyNewTabUrl(fresh.pendingUrl))){
      return {tab:fresh,bootstrapped:false,navigationOnly:true};
    }
    throw Error('Esta página é protegida do navegador. Escolha uma aba web ou uma conversa nova.');
  }
  // Recheck: the user may have navigated between our first read and update.
  try {tab=await browserApi.tabs.get(tabId);}catch{throw Error('A aba desta conversa foi fechada.');}
  if(isWebTabUrl(tab.url))return {tab:await waitForWebLoad(browserApi,tabId,tab,Date.now()+timeoutMs,intervalMs),bootstrapped:false};
  if(isWebTabUrl(tab.pendingUrl))throw Error('A aba começou a carregar um site. Aguarde e tente novamente.');
  if((tab.pendingUrl&&!isEmptyNewTabUrl(tab.pendingUrl))||!isEmptyNewTabUrl(tab.url))throw Error('A aba mudou antes do início. Confirme o site e tente novamente.');
  try {await browserApi.tabs.update(tabId,{url:homeUrl});}
  catch {throw Error('Não foi possível preparar a aba de trabalho. Abra um site HTTP(S) manualmente.');}
  const until=Date.now()+timeoutMs;
  do {
    try {tab=await browserApi.tabs.get(tabId);}catch{throw Error('A aba de trabalho foi fechada.');}
    if(isWebTabUrl(tab.url))return {tab:await waitForWebLoad(browserApi,tabId,tab,until,intervalMs),bootstrapped:true};
    await pause(intervalMs);
  }while(Date.now()<until);
  throw Error('A aba de trabalho ainda está carregando. Aguarde alguns segundos e tente novamente.');
}
