// Preferências de acesso por origem. Não concede permissões do Chrome.
export const SITE_MODES = Object.freeze(['ask','allow','block']);
export function validOrigin(value) {
  if(typeof value!=='string') throw Error('Origem inválida.');
  const u=new URL(value);
  if(!['http:','https:'].includes(u.protocol) || u.username || u.password || u.origin!==value || u.origin==='null')
    throw Error('Somente origem de site http(s), sem caminho ou credenciais.');
  return u.origin;
}
export function normalizeSiteMode(value){return SITE_MODES.includes(value)?value:'ask';}
export function checkSiteAccess(origin,entries={}) {
  const key=validOrigin(origin); const mode=normalizeSiteMode(entries[key]);
  return {origin:key,mode,allowed:mode==='allow',blocked:mode==='block',needsConsent:mode==='ask'};
}
// Uma autorização CDP concedida para uma execução não deve valer para outra.
export function checkCdpGrant(run,{runId,tabId}) {
  return Boolean(run && run.runId===runId && run.tabId===tabId && run.cdpGranted===true);
}
