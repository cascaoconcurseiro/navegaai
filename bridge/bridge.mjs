// Ponte LOCAL opcional para servidores MCP que rejeitam a Origin de extensões Chromium.
// Sem bibliotecas externas. Node.js >=20. Usa autenticação por token gerado a cada execução.
import http from 'node:http';
import {randomBytes} from 'node:crypto';
const port=Number(process.env.NAVEGAAI_BRIDGE_PORT||9842);
const upstream=process.env.NEO_MCP_URL||'http://127.0.0.1:9200/mcp';
const url=new URL(upstream);
if (url.protocol!=='http:' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname)|| !/^\/mcp\/?$/.test(url.pathname)) {
  throw Error('NEO_MCP_URL deve ser local e terminar em /mcp');
}
const token=randomBytes(24).toString('hex');
const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin||'';
  if (/^chrome-extension:\/\/[a-z]{32}$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Accept, Mcp-Session-Id, X-NavegaAI-Token');
    res.setHeader('Access-Control-Expose-Headers','Mcp-Session-Id');
  }
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  if(req.url==='/health' && req.method==='GET') {res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true,proxy:'NavegaAI',upstream:url.origin}));}
  if (req.url!=='/mcp'||req.method!=='POST') {res.writeHead(404);return res.end();}
  if (!/^chrome-extension:\/\/[a-z]{32}$/.test(origin) || req.headers['x-navegaai-token']!==token) {
    res.writeHead(403);return res.end('Origem ou token inválido.');
  }
  if(!(req.headers['content-type']||'').includes('application/json')) {res.writeHead(415);return res.end();}
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>2_000_000){res.writeHead(413);return res.end();}chunks.push(chunk);}
  try {
    const payload=Buffer.concat(chunks);
    JSON.parse(payload.toString('utf-8'));
    const upstreamResponse=await fetch(upstream,{
      method:'POST',signal:AbortSignal.timeout(90000),
      headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream',...(req.headers['mcp-session-id']?{'Mcp-Session-Id':String(req.headers['mcp-session-id'])}:{})},
      body:payload
    });
    const responseText=await upstreamResponse.text();
    res.writeHead(upstreamResponse.status,{
      'Content-Type':upstreamResponse.headers.get('content-type')||'application/json',
      ...(upstreamResponse.headers.get('mcp-session-id')?{'Mcp-Session-Id':upstreamResponse.headers.get('mcp-session-id')}:{})
    });
    res.end(responseText);
  }catch(err){res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:String(err.message).slice(0,350)}));}
});
server.listen(port,'127.0.0.1',()=>{
 console.log('\nNavegaAI | Ponte MCP local ativa');
 console.log(`Endpoint da ponte: http://127.0.0.1:${port}/mcp`);
 console.log(`BrowserOS neo: ${upstream}`);
 console.log(`TOKEN TEMPORÁRIO: ${token}`);
 console.log('\nCole este token nos ajustes da extensão (Modo: ponte local).');
 console.log('Não compartilhe o token. Feche esta janela para encerrar a ponte.\n');
});
