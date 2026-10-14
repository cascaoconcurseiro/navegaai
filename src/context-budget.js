// Trim stale browser observations without dropping tool-call replies (the
// chat-completions protocol requires one response per requested tool call).
// This prevents an agent from resending many old page snapshots each round.
export function compactOldContext(messages, {keepRecentTools=7,maxOldToolChars=320}={}){
 if(!Array.isArray(messages))return {compacted:0,imagesRemoved:0};
 const positions=[];
 for(let i=0;i<messages.length;i++)if(messages[i]?.role==='tool')positions.push(i);
 const cutoff=positions[Math.max(0,positions.length-keepRecentTools)]??0;
 let compacted=0,imagesRemoved=0;
 for(let i=0;i<cutoff;i++){
  const msg=messages[i];
  if(msg?.role==='tool'&&typeof msg.content==='string'&&msg.content.length>maxOldToolChars){
   // Preserve the beginning of errors and action results, but never preserve
   // obsolete element refs as if they were current.
   const earlier=msg.content;
   const diagnostic=earlier.toLowerCase().includes('error')||earlier.toLowerCase().includes('falha');
   msg.content=`[Observação antiga resumida; refs não são válidas. ${diagnostic?'Houve erro neste passo; consulte auditoria.':'Use get_page para inspecionar o estado atual.'}]`;
   compacted++;
  }
  if(msg?.role==='user'&&Array.isArray(msg.content)&&msg.content.some(x=>x?.type==='image_url')){
   msg.content=[{type:'text',text:'[Captura antiga removida do contexto para preservar privacidade e reduzir custo. Faça nova captura se necessário.]'}];
   imagesRemoved++;
  }
 }
 return {compacted,imagesRemoved};
}
