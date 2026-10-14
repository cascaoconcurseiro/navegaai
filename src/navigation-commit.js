// Wait for Chrome to commit the requested navigation. tabs.update() resolving
// means only that Chrome accepted the command; the old tab may still be
// reported as 'complete'. Never confuse that old state with a finished action.
import {isWebTabUrl} from './tab-readiness.js';

export async function waitForCommittedNavigation(browserApi,tabId,{
  beforeUrl='',requestedUrl='',signal=null,timeoutMs=20000,intervalMs=120
}={}){
  if(!isWebTabUrl(requestedUrl))throw Error('URL de navegação inválida.');
  const until=Date.now()+Math.max(100,timeoutMs);
  let sawLoading=false,observedTarget=false,last=null;
  while(Date.now()<until){
    if(signal?.aborted)throw Error('NAVEGACAO_INTERROMPIDA: resultado não confirmado. Não repita ações irreversíveis.');
    try{last=await browserApi.tabs.get(tabId);}catch{throw Error('A aba foi fechada durante a navegação.');}
    if(/^chrome-error:\/\//.test(String(last.url||'')))throw Error('NAVEGACAO_BLOQUEADA: o Chrome abriu sua página interna de erro. Verifique conexão, DNS e permissões da rede; o NavegaAI não pode contornar essas restrições.');
    const committed=isWebTabUrl(last.url);
    if(last.status==='loading'||(last.pendingUrl&&last.pendingUrl!==last.url))sawLoading=true;
    // A different URL is evidence that a new document/route committed. An
    // unchanged URL requires an observed loading transition, not stale data.
    const changed=committed&&last.url!==beforeUrl;
    if(changed)observedTarget=true;
    if(committed&&last.status==='complete'&&(!last.pendingUrl||last.pendingUrl===last.url)&&
       (observedTarget||(sawLoading&&last.url===requestedUrl))){
      return last;
    }
    await new Promise(resolve=>setTimeout(resolve,intervalMs));
  }
  const at=last?.url?` Última URL observada: ${String(last.url).slice(0,180)}`:'';
  throw Error('NAVEGACAO_SEM_CONFIRMACAO: o Chrome aceitou o endereço, mas não confirmou o carregamento. Verifique a aba antes de tentar novamente.'+at);
}
