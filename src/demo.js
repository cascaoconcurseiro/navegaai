import {compact,classifyAction,shouldApprove} from './policies.js';

function pageFromJson(raw) {
  const parsed=typeof raw==='string'?JSON.parse(raw):raw;
  return parsed;
}
function simpleSummary(text) {
  const clean=(text||'').replace(/\s+/g,' ').trim();
  if(!clean) return 'A página não apresentou texto legível.';
  const sentences=clean.match(/[^.!?\n]+[.!?]?/g)||[clean];
  return sentences.slice(0,5).map(x=>x.trim()).filter(Boolean).join(' ').slice(0,1100);
}

// DEMONSTRAÇÃO sem chamada de LLM: regras transparentes que executam ações reais.
export async function runDemo({userMessage,adapter,settings={},signal,onEvent,requestApproval}) {
  const q=userMessage.trim();
  const act=async(name,args={})=>{
    if(signal.aborted) throw Error('Execução interrompida.');
    onEvent({type:'tool_start',name,args});
    if(name!=='get_page') {
      if(settings.approvalMode==='read_only')throw Error('Modo somente leitura: nenhuma alteração na página é permitida.');
      const risk=classifyAction(name,args,null,await adapter.getOrigin?.());
      if(shouldApprove(settings.approvalMode||'review',risk) && !await requestApproval({name,args,detail:JSON.stringify(args)})) throw Error('Ação não autorizada.');
    }
    const result=await adapter.execute(name,args);
    onEvent({type:'tool_success',name,result:compact(result,400)});
    return result;
  };
  let answer;
  const open=q.match(/^(?:abra|abrir|acesse|navegue(?: para)?|open)\s+(https?:\/\/\S+)/i);
  const click=q.match(/^(?:clique|clicar|click)\s+(?:em\s+)?(e\d+)$/i);
  const fill=q.match(/^(?:preencha|digite|escreva|fill)\s+(e\d+)\s+(?:com\s+|: ?)(.+)$/i);
  if(open) {
    const r=await act('navigate_tab',{url:open[1]});
    answer=`Abri ${r.url} na guia atual. Use “resuma esta página” ou “liste os elementos” para continuar.`;
  } else if(click) {
    const r=await act('click_element',{ref:click[1].toLowerCase()});
    answer=`Clique realizado no elemento ${r.ref}. Peça “liste os elementos” para conferir o estado atual.`;
  } else if(fill) {
    const r=await act('fill_element',{ref:fill[1].toLowerCase(),text:fill[2]});
    answer=`Preenchi ${r.ref} com ${r.length} caracteres. Nenhum formulário foi enviado automaticamente.`;
  } else if(/abas|guias|tabs/i.test(q)) {
    answer='O NavegaAI atua somente na aba autorizada. Não é possível listar ou controlar outras abas durante uma tarefa.';
  } else {
    const p=pageFromJson(await act('get_page'));
    if(/links|endereços|urls/i.test(q)) {
      const links=p.elements.filter(e=>e.includes('href=')).slice(0,30);
      answer=`Links identificados em ${p.title}:\n${links.join('\n')||'Nenhum link visível.'}`;
    } else if(/elementos|botões|campos|clique|clicar|interagir/i.test(q)) {
      answer=`Página: ${p.title}\n\nElementos interativos:\n${p.elements.slice(0,35).join('\n')||'Nenhum elemento encontrado.'}\n\nExemplos: “clique em e2” ou “preencha e4 com texto”.`;
    } else {
      answer=`📄 ${p.title}\n${p.url}\n\nResumo extrativo (sem IA): ${simpleSummary(p.text)}\n\nPara raciocínio e automação por linguagem natural, configure uma API em Ajustes.`;
    }
  }
  onEvent({type:'answer',text:answer});
  return {answer};
}
