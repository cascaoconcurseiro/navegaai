// A continuation re-observes the current tab and uses prior context; it never
// replays old tool calls, especially writes whose effect may be indeterminate.
export function isContinuation(text=''){
 return /^(?:continue|continuar|continua|retome|retomar|prossiga|pode continuar)[.!\s]*$/i.test(String(text).trim());
}
export function buildContinuation(input,thread={},auditEvents=[]){
 if(!isContinuation(input))return {prompt:input,resumed:false};
 const previous=[...(thread.messages||[])].reverse().find(m=>m.role==='user'&&!isContinuation(m.text));
 if(!previous?.text)return {prompt:'O usuário solicitou continuar, mas não há objetivo anterior nesta conversa. Peça que explique qual tarefa deseja retomar.',resumed:false};
 const last=(auditEvents||[]).filter(e=>e?.event==='run_finished').at(-1);
 const uncertain=(auditEvents||[]).filter(e=>e?.event==='agent_indeterminate_action').slice(-3)
   .map(x=>String(x.name||'ação').slice(0,50));
 const errors=(auditEvents||[]).filter(e=>e?.event==='agent_tool_error').slice(-3)
   .map(x=>String(x.error||x.name||'erro').slice(0,120));
 const prompt=`CONTINUAÇÃO EXPLICITAMENTE PEDIDA PELO USUÁRIO.\nObjetivo anterior: ${String(previous.text).slice(0,1400)}\n`+
  `Situação anterior: ${String(last?.outcome||thread.status||'desconhecida').slice(0,80)}.\n`+
  `Ações com efeito incerto: ${uncertain.length?uncertain.join('; '):'nenhuma identificada no trecho recente'}.\n`+
  `Erros recentes: ${errors.length?errors.join('; '):'nenhum no trecho recente'}.\n`+
  'ANTES DE AGIR, faça get_page e reconstrua o plano com base no estado atual. Não repita envio, publicação, compra ou operações irreversíveis sem evidência e nova autorização. NÃO presuma que operações anteriores falharam apenas porque não houve resposta. Use somente as ferramentas autorizadas.\nContinue o objetivo original com cautela.';
 return {prompt,resumed:true};
}
