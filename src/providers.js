import { validateApiBase, scrubError } from './policies.js';

export const PROVIDERS = {
  demo: { label:'Demonstração local',base:'',model:'demo-local' },
  openrouter: {label:'OpenRouter',base:'https://openrouter.ai/api/v1',model:'deepseek/deepseek-chat'},
  deepseek: {label:'DeepSeek',base:'https://api.deepseek.com',model:'deepseek-chat'},
  qwen: {label:'Qwen (DashScope)',base:'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',model:'qwen-plus'},
  custom: {label:'API compatível',base:'http://localhost:1234/v1',model:'local-model'}
};

export function createSettings() {
  return { provider:'demo', baseURL:'',model:'',backend:'chrome',runtimeUrl:'http://127.0.0.1:8765/',runtimeOrigins:'',neoUrl:'http://127.0.0.1:9200/mcp',neoTransport:'direct',bridgeToken:'',
    confirmActions:true, approvalMode:'review', rememberKey:false, maxSteps:20, apiKey:'',showTechnicalEvents:false,streamResponses:true,visionEnabled:false,maxRuntimeMs:480000 };
}

export function normalizeSettings(value={}) {
  const s={...createSettings(),...value};
  if (!(s.provider in PROVIDERS)) s.provider='demo';
  if (!['chrome','neo','runtime'].includes(s.backend)) s.backend='chrome';
  if (!['direct','bridge'].includes(s.neoTransport)) s.neoTransport='direct';
  s.maxSteps=Math.min(40,Math.max(1,Number(s.maxSteps)||20));
  s.maxRuntimeMs=Math.min(900000,Math.max(60000,Number(s.maxRuntimeMs)||480000));
  s.confirmActions=Boolean(s.confirmActions);s.showTechnicalEvents=s.showTechnicalEvents===true;s.streamResponses=s.streamResponses!==false;s.visionEnabled=s.visionEnabled===true;
  if(s.approvalMode==='safe')s.approvalMode='auto';
  if(!['review','auto','skip','read_only'].includes(s.approvalMode))s.approvalMode='review';
  return s;
}

// Streaming parser handles arbitrary network chunk boundaries and accumulated tool-call arguments.
export async function parseCompletionStream(stream,onDelta=()=>{}){
 const reader=stream.getReader(),decoder=new TextDecoder();let buffer='',content='',usage=null;
 const calls=new Map();let finished=false;
 const parseBlock=(block)=>{
  const raw=block.split(/\r?\n/).filter(s=>s.startsWith('data:')).map(s=>s.slice(5).trimStart()).join('\n');
  if(!raw||raw==='[DONE]')return;
  let item;try{item=JSON.parse(raw);}catch{return;}
  if(item.error)throw Error('Falha do provedor durante a geração: '+JSON.stringify(item.error).slice(0,220));
  if(item.usage)usage=item.usage;
  const delta=item.choices?.[0]?.delta||{};
  if(typeof delta.content==='string'){content+=delta.content;onDelta(content);}
  for(const tc of delta.tool_calls||[]){
   const index=Number(tc.index)||0;
   let call=calls.get(index)||{id:'',type:'function',function:{name:'',arguments:''}};
   if(tc.id)call.id=tc.id;
   if(tc.function?.name)call.function.name+=tc.function.name;
   if(tc.function?.arguments)call.function.arguments+=tc.function.arguments;
   calls.set(index,call);
  }
 };
 while(!finished){const {done,value}=await reader.read();if(done){finished=true;break;}
  buffer+=decoder.decode(value,{stream:true});let end;
  while((end=buffer.search(/\r?\n\r?\n/))!==-1){const match=buffer.slice(end).match(/^\r?\n\r?\n/)[0];const block=buffer.slice(0,end);buffer=buffer.slice(end+match.length);parseBlock(block);}
 }
 buffer+=decoder.decode();if(buffer.trim())parseBlock(buffer);
 return {content,tool_calls:[...calls.entries()].sort((a,b)=>a[0]-b[0]).map(([,c])=>c),usage};
}

export async function requestCompletion({settings,messages,tools,signal,onDelta}) {
  if (settings.provider==='demo') throw new Error('Use o executor de demonstração para o modo local.');
  const selected=PROVIDERS[settings.provider];
  const base=validateApiBase(settings.baseURL || selected.base);
  const model=settings.model || selected.model;
  const key=settings.apiKey?.trim();
  if (!model) throw new Error('Informe o modelo nas configurações.');
  if (!key && !base.startsWith('http://localhost') && !base.startsWith('http://127.0.0.1')) throw new Error('Informe sua chave de API nas configurações.');
  const endpoint=base + '/chat/completions';
  const controller = new AbortController();
  const onAbort=()=>controller.abort();
  signal?.addEventListener('abort',onAbort,{once:true});
  const timer=setTimeout(()=>controller.abort(),90000);
  try {
    const response=await fetch(endpoint,{
      method:'POST',signal:controller.signal,
      headers:{'Content-Type':'application/json',...(key?{Authorization:`Bearer ${key}`}:{})},
      body:JSON.stringify({model,messages,tools,tool_choice:'auto',temperature:0.2,stream:settings.streamResponses!==false})
    });
    if (!response.ok) {
      const info=(await response.text()).slice(0,450);
      throw new Error(`API HTTP ${response.status}: ${info.replace(/sk-[\w-]{8,}/g,'[chave oculta]')}`);
    }
    if(settings.streamResponses!==false && response.body && response.headers?.get('content-type')?.includes('text/event-stream')){
      return parseCompletionStream(response.body,onDelta);
    }
    const json=await response.json();
    const choice=json?.choices?.[0]?.message;
    if (!choice) throw new Error('API não retornou choices[0].message. Confira modelo e endpoint.');
    return {content:choice.content || '',tool_calls:choice.tool_calls || [],usage:json.usage || null};
  } catch(e) {
    if (e.name==='AbortError') throw new Error('Solicitação cancelada ou tempo limite excedido.');
    throw new Error(scrubError(e));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort',onAbort);
  }
}
