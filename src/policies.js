export const MAX_STEPS = 40;
export const MAX_TOOL_TEXT = 16000;
export const MAX_TOOL_CALLS_PER_ROUND = 4;

export function validateWebUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) throw new Error('URL inválida ou longa demais.');
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error('Informe uma URL completa: https://...'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Somente URLs http(s), sem credenciais embutidas, são permitidas.');
  }
  return parsed.href;
}

export function validateMcpUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('URL MCP inválida.'); }
  if (url.protocol !== 'http:' || !['127.0.0.1','localhost','[::1]'].includes(url.hostname)) {
    throw new Error('Por segurança, o MCP deve utilizar http://127.0.0.1 ou localhost.');
  }
  if (!/\/mcp\/?$/.test(url.pathname) || url.search || url.hash || url.username || url.password) {
    throw new Error('Use o endereço /mcp mostrado no BrowserOS neo.');
  }
  return url.href;
}

export function validateApiBase(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('Endpoint da API inválido.'); }
  if (url.username || url.password || url.search || url.hash) throw new Error('A API não deve conter usuário, senha ou parâmetros no endereço.');
  const loopback = ['127.0.0.1', 'localhost','[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) {
    throw new Error('APIs externas exigem HTTPS. HTTP é aceito apenas em localhost.');
  }
  return url.href.replace(/\/$/, '');
}

export function isSensitiveField(input) {
  const type = (input?.type || '').toLowerCase();
  const name = [input?.name, input?.id, input?.autocomplete, input?.placeholder, input?.getAttribute?.('aria-label')]
    .filter(Boolean).join(' ').toLowerCase();
  return ['password', 'hidden', 'file'].includes(type) ||
    /senha|password|passcode|secret|token|cart[aã]o|credit.?card|cvv|cvc|social.?security|cpf|pix|otp|two.?factor|2fa|c[oó]digo.?de.?verifica/i.test(name);
}

export const NATIVE_READ_TOOLS = new Set(['get_page','verify_page','capture_viewport']);
export function isMutation(name) { return !NATIVE_READ_TOOLS.has(name) && name !== 'neo_snapshot' && name !== 'neo_read'; }
export function approvalRequired(name,args,mode='review') {
  // Compatibilidade com configuração anterior booleana.
  if(typeof mode==='boolean') mode=mode?'review':'safe';
  if(!isMutation(name)) return false;
  if(mode==='read_only') return true; // Agente bloqueia mutações antes de pedir aprovação.
  if(mode==='review') return true;
  // Em modo ágil, cliques/navegação continuam sujeitos a aprovação, pois podem enviar dados.
  return name.startsWith('neo_') || ['click_element','navigate_tab','new_tab','switch_tab'].includes(name);
}

export function compact(text, max = MAX_TOOL_TEXT) {
  const v = typeof text === 'string' ? text : JSON.stringify(text);
  return v.length > max ? v.slice(0, max) + '\n[Saída truncada]' : v;
}

export function safeJsonParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

export function scrubError(error) {
  return String(error?.message || error).replace(/sk-[A-Za-z0-9_-]{8,}/g, '[chave oculta]').slice(0, 800);
}

const HIGH_RISK=/(?:delete|remove|erase|purchase|buy|checkout|pay|transfer|withdraw|subscribe|grant|permission|authorize|send|submit|publish|post|upload|excluir|apagar|remover|comprar|pagar|transferir|sacar|enviar|publicar|assinar|confirmar|autorizar|permiss[aã]o)/i;
// Hard stops apply even in skip mode: permissions do not authorize financial or irreversible operations.
const FORBIDDEN_ACTION=/(?:finaliz(?:ar|e) (?:compra|pedido)|confirm(?:ar| order)|pay now|place order|complete purchase|purchase now|comprar agora|efetuar pagamento|pagar agora|checkout|transfer(?:ir| funds)|withdraw(?:al)?|sacar dinheiro|excluir permanentemente|delete permanently|empty trash|esvaziar lixeira|grant (?:access|permissions?)|conceder permiss[aã]o)/i;
export function classifyAction(name,args={},preview=null,origin=''){
 if(!isMutation(name))return {kind:'read',needsApproval:false,blocked:false,reason:'Somente leitura'};
 if(preview?.sensitive)return {kind:'protected',needsApproval:true,blocked:true,reason:'Elemento sensível bloqueado'};
 if(preview?.opensNewTab)return {kind:'blocked',needsApproval:true,blocked:true,reason:'Abriria uma nova aba'};
 if(preview?.disabled)return {kind:'blocked',needsApproval:true,blocked:true,reason:'Elemento desabilitado'};
 const evidence=[preview?.label,preview?.href,args?.url].filter(Boolean).join(' ');
 if(FORBIDDEN_ACTION.test(evidence))return {kind:'forbidden',needsApproval:false,blocked:true,reason:'Operação financeira, exclusão permanente ou alteração de permissões não é permitida pelo NavegaAI.'};
 if(HIGH_RISK.test(evidence))return {kind:'high',needsApproval:true,blocked:false,reason:'Ação potencialmente sensível ou irreversível'};
 if(name==='scroll_page')return {kind:'low',needsApproval:false,blocked:false,reason:'Rolagem local'};
 if(name==='click_element' && preview?.tag==='a' && preview.href){
  try{let u=new URL(preview.href);if(u.protocol==='https:'&&u.origin===origin)return {kind:'low',needsApproval:false,blocked:false,reason:'Link interno do mesmo site'};}catch{}
 }
 if(name==='fill_element' && /pesquisa|search|buscar|filtrar|filter/i.test(preview?.label||'') && String(args.text||'').length<=120)
  return {kind:'low',needsApproval:false,blocked:false,reason:'Campo de pesquisa'};
 return {kind:'medium',needsApproval:true,blocked:false,reason:'Ação interativa'};
}
export function shouldApprove(mode,classification){
  if(mode==='read_only')return false; // blocked by executor, not approval
  if(mode==='review')return classification.kind!=='read';
  if(mode==='auto'||mode==='safe')return classification.kind==='high'||classification.kind==='protected';
  if(mode==='skip')return false; // user explicitly chose skip; immutable hard blocks remain
  return classification.kind!=='read';
}
