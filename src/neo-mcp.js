import { validateMcpUrl, compact } from './policies.js';

// MCP Streamable HTTP: initialize -> notifications/initialized -> tools/list -> tools/call.
// Mantém Session ID quando o servidor usar sessões; aceita respostas JSON e SSE.
export class NeoMcp {
  constructor(url, bridgeToken = '') {
    this.url=validateMcpUrl(url); this.bridgeToken=bridgeToken; this.sessionId=''; this.id=0; this.tools=[];
  }
  async send(method,params={},signal,notification=false) {
    const body={jsonrpc:'2.0',method,params};
    if (!notification) body.id=++this.id;
    const headers={
      'Content-Type':'application/json',
      'Accept':'application/json, text/event-stream',
      ...(this.sessionId?{'Mcp-Session-Id':this.sessionId}:{}),
      ...(this.bridgeToken?{'X-NavegaAI-Token':this.bridgeToken}:{})
    };
    const response=await fetch(this.url,{method:'POST',headers,body:JSON.stringify(body),signal});
    if (!response.ok) throw new Error(`BrowserOS neo HTTP ${response.status}: ${(await response.text()).slice(0,350)}`);
    const sid=response.headers.get('mcp-session-id');
    if(sid) this.sessionId=sid;
    if (notification || response.status===202 || response.status===204) return null;
    const text=await response.text();
    const ct=response.headers.get('content-type')||'';
    let msg;
    if (ct.includes('text/event-stream')) {
      const lines=text.replace(/\r/g,'').split('\n');
      const payloads=[];
      for (const line of lines) {
        if(line.startsWith('data:')) {
          try {payloads.push(JSON.parse(line.slice(5).trim()));} catch {}
        }
      }
      msg=payloads.find(x=>x.id===body.id) || payloads.find(x=>x.result||x.error);
    } else {
      try {msg=JSON.parse(text);} catch {throw new Error('Resposta MCP não é JSON nem SSE válido.');}
    }
    if (!msg) throw Error('MCP não retornou resultado.');
    if (msg.error) throw Error(`MCP: ${msg.error.message||JSON.stringify(msg.error)}`);
    return msg.result;
  }
  async initialize(signal) {
    await this.send('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'navegaai-extension',version:'0.1.0'}},signal);
    await this.send('notifications/initialized',{},signal,true);
    const listing=await this.send('tools/list',{},signal);
    const allowed=new Set(['tabs','navigate','snapshot','read','act','name_session']);
    this.tools=(listing?.tools||[]).filter(tool=>allowed.has(tool.name) && tool.inputSchema);
    if (!this.tools.length) throw new Error('Conectou ao MCP, mas não encontrou ferramentas de navegação compatíveis.');
    return this.tools;
  }
  openAiTools() {
    return this.tools.map(tool=>({
      type:'function',function:{name:'neo_'+tool.name,
        description:`BrowserOS neo: ${String(tool.description||tool.name).slice(0,650)}`,
        parameters:tool.inputSchema}
    }));
  }
  async execute(name,args={},signal) {
    const tool=name.replace(/^neo_/,'');
    if (!this.tools.some(t=>t.name===tool)) throw Error('Ferramenta MCP não permitida.');
    // Regras por ferramenta: sem execução arbitrária de JS e sem fechar guias.
    if (tool==='tabs' && !['list','new','active'].includes(args.action)) throw Error('Ação de abas bloqueada nesta versão.');
    if (tool==='navigate') {
      if (args.url) {
        const u=new URL(args.url);
        if (!['http:','https:'].includes(u.protocol) || u.username||u.password) throw Error('URL do neo bloqueada.');
      }
      if(args.action && !['back','forward','reload'].includes(args.action)) throw Error('Ação de navegação desconhecida.');
    }
    if (tool==='tabs' && args.action==='new' && args.url) {
      const u=new URL(args.url); if(!['http:','https:'].includes(u.protocol)) throw Error('URL bloqueada.');
    }
    const result=await this.send('tools/call',{name:tool,arguments:args},signal);
    if (result?.isError) throw new Error(compact(result.content,1000));
    return compact(result?.content||result);
  }
}
