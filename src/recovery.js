// Conservative self-healing for ephemeral DOM references. We NEVER replay a
// dispatched click, and NEVER guess a target from partial/fuzzy similarity.
export function normalizeAccessibleName(value='') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/\s+/g,' ').trim();
}

export function recoverablePreflight(error) {
  const message=String(error?.message||error);
  return /PREVIEW_INDISPONIVEL|ALVO_INCOMPATIVEL|Refs expiraram|Elemento não encontrado\/visível/.test(message);
}

export function findReplacementRef(snapshot, name, expectedLabel) {
  if(!['click_element','fill_element'].includes(name) || !expectedLabel ||
     !Array.isArray(snapshot?.elements))return null;
  const expected=normalizeAccessibleName(expectedLabel);
  if(expected.length<2||expected.length>130)return null;
  const choices=[];
  for(const row of snapshot.elements){
    if(typeof row!=='string'||row.includes('[campo protegido]'))continue;
    const match=row.match(/^(e\d+)\s+(\S+)(?:\s+role=([^\s]+))?/);
    const label=row.match(/\bnome="([^"]+)"/);
    if(!match||!label||normalizeAccessibleName(label[1])!==expected)continue;
    const [,ref,tag,role='']=match;
    if(name==='click_element' && !['button','a','summary'].includes(tag) &&
      !['button','link','menuitem','tab','checkbox','radio'].includes(role))continue;
    if(name==='fill_element' && !['input','textarea'].includes(tag) && role!=='textbox' && !row.includes('contenteditable'))continue;
    choices.push({ref,label:label[1],tag,role});
  }
  // Ambiguity is not a reason to guess. Let the model inspect the fresh page.
  return choices.length===1?choices[0]:null;
}

export function isReversibleRead(name){
  return ['get_page','verify_page','capture_viewport','neo_snapshot','neo_read'].includes(name);
}

export function classifyToolFailure(error){
  const s=String(error?.message||error);
  if(/ALVO_INCOMPATIVEL|PREVIEW_INDISPONIVEL|Refs expiraram|Elemento não encontrado/i.test(s))return 'stale_target';
  if(/não autorizado|negad|recusad|bloquead|protegido|somente leitura/i.test(s))return 'permission';
  if(/cancelad|interrompida|aborted/i.test(s))return 'cancelled';
  if(/timeout|tempo limite|aguarde|carregando/i.test(s))return 'timeout';
  if(/429|quota|rate limit/i.test(s))return 'rate_limit';
  if(/verification|verifica|não confirmado/i.test(s))return 'unverified';
  return 'unknown';
}

// Deterministic run assessment. The displayed success label must never be
// generated from model prose alone: it is derived from independently observed
// tool outcomes and verification metrics.
export function diagnoseRun(metrics={}){
  const problems=[];
  if(metrics.unfulfilledAction)problems.push({code:'not_executed',severity:'high',message:'O pedido exigia uma ação, mas nenhuma ação foi executada.'});
  if(metrics.pendingVerification||metrics.unverifiedCount>0||metrics.mutations>0&&!metrics.verifiedProofs)
    problems.push({code:'unverified',severity:'high',message:'Existem alterações sem confirmação independente do objetivo.'});
  if(metrics.indeterminateDispatches)problems.push({code:'indeterminate_dispatch',severity:'high',message:'Uma ação pode ter produzido efeito sem resposta do navegador. Não repetir automaticamente.'});
  if(metrics.noVisibleChanges)problems.push({code:'no_visible_change',severity:'low',message:'Houve ações sem mudança visível imediatamente observável; verifique os efeitos.'});
  if(metrics.unresolvedWeakEvidenceCount)problems.push({code:'weak_evidence',severity:'high',message:'Uma confirmação foi detectada sem prova de mudança causada por esta ação.'});
  if(metrics.verificationFailures)problems.push({code:'failed_assertion',severity:metrics.unverifiedCount?'high':'low',message:metrics.unverifiedCount?'Uma verificação de resultado não foi satisfeita.':'Houve verificações negativas intermediárias, resolvidas após nova prova.'});
  if(metrics.failureKinds?.stale_target)problems.push({code:'stale_target',severity:'medium',message:'A página mudou e invalidou referências de elementos.'});
  if(metrics.failureKinds?.permission)problems.push({code:'permissions',severity:'high',message:'Uma permissão ou política impediu a execução.'});
  if(metrics.toolFailures)problems.push({code:'tool_failure',severity:'medium',message:'Há chamadas de ferramentas com erro.'});
  if(metrics.stalledObservations||metrics.retryBlocks)problems.push({code:'no_progress',severity:'medium',message:'Foram detectadas repetição de ações ou observações sem progresso.'});
  const verified=metrics.mutations>0&&metrics.verifiedProofs>0&&!problems.some(x=>x.severity==='high')&&!metrics.toolFailures;
  return {state:verified?'verified':problems.length?'needs_review':metrics.mutations?'unverified':'read_only',problems,
    recoveries:{attempts:metrics.recoveryAttempts||0,succeeded:metrics.recoveredTargets||0},
    modelLatencyMs:metrics.modelLatencyMs||0,toolLatencyMs:metrics.toolLatencyMs||0};
}
